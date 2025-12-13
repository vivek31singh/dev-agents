import { createStep, createWorkflow, Step } from "@mastra/core/workflows";
import { z } from "zod";
import { fetchAllRepositoryFiles, commitFilesToBranch } from "@/lib/git";
import { storeVector, removeVectors, searchVector } from "@/lib/vector";
import { nextjsCoderAgent } from "../agents/nextjs-coder";
import { codeCriticAgent } from "../agents/code-critic";

const MAX_FILE_SIZE = 50000;
const SKIP_PATTERNS = [
    'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '.lock',
    '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf',
    '.mp4', '.mp3', '.webm', '.pdf', '.zip', '.tar', '.gz',
    'node_modules/', '.next/', 'dist/', '.git/', '.md',
];

// --- Helpers ---

function shouldSkipFile(filePath: string, content: string): boolean {
    if (SKIP_PATTERNS.some(pattern => filePath.toLowerCase().includes(pattern.toLowerCase()))) return true;
    if (content.length > MAX_FILE_SIZE) return true;
    const nonPrintable = content.slice(0, 1000).split('').filter(c => c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0))).length;
    return nonPrintable > 10;
}

function chunkText(text: string, maxChars: number = 3000): string[] {
    const chunks: string[] = [];
    let currentChunk = "";
    const lines = text.split('\n');
    for (const line of lines) {
        if (currentChunk.length + line.length > maxChars) {
            if (currentChunk.trim()) chunks.push(currentChunk.trim());
            currentChunk = line;
        } else {
            currentChunk += (currentChunk ? '\n' : '') + line;
        }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks.length > 0 ? chunks : [text.trim()].filter(Boolean);
}

// --- Schemas ---

const TaskSchema = z.object({
    id: z.number(),
    title: z.string(),
    description: z.string(),
    dependencies: z.array(z.number()).optional(),
    status: z.enum(["pending", "completed", "failed"]),
    context: z.string().optional(),
});

const developmentInputSchema = z.object({
    repositoryName: z.string(),
});

const sharedStateSchema = z.object({
    repoName: z.string(),
    owner: z.string(),
});

// --- MAIN ORCHESTRATOR STEP (ReAct + Sequential) ---

const processQueueStep = createStep({
    id: "process-queue",
    description: "Sequentially processes tasks with ReAct loop and immediate context updates",
    inputSchema: z.array(TaskSchema),
    stateSchema: sharedStateSchema,
    outputSchema: z.object({
        completedCount: z.number(),
        failedCount: z.number(),
    }),
    execute: async ({ inputData, state }) => {
        const tasks = inputData.filter(t => t.status === 'pending');
        const { owner, repoName } = state;
        let completedCount = 0;
        let failedCount = 0;

        console.log(`[process-queue] Starting sequential processing of ${tasks.length} tasks.`);

        for (const task of tasks) {
            console.log(`\n=== Processing Task ${task.id}: ${task.title} ===`);

            // 1. Retrieve Context
            const query = `${task.title} ${task.description}`;
            const searchRes = await searchVector({ data: query, topK: 5 });
            const contextFiles = searchRes.map(r => ({
                fileName: r.metadata?.fileName as string || "unknown",
                content: (r.data || "").slice(0, 10000) // Truncate for safety
            }));

            let feedback = "";
            let generatedFiles: { path: string, content: string }[] = [];
            let approved = false;

            // 2. ReAct Loop (Generate <-> Critic)
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    console.log(`  [Attempt ${attempt}] Generating code...`);

                    let systemPrompt = `Task: ${task.title}\nDesc: ${task.description}\nRepo: ${repoName}`;

                    if (generatedFiles.length > 0) {
                        systemPrompt += `\n\n=== PREVIOUS ATTEMPT (EDIT THIS TO FIX CRITIC ISSUES) ===\n${generatedFiles.map(f => `// File: ${f.path}\n${f.content}`).join('\n\n')}`;
                    }

                    if (feedback) {
                        systemPrompt += `\n\n=== CRITIC FEEDBACK (REQUIRED FIXES) ===\n${feedback}\nPlease fix the issues in the PREVIOUS ATTEMPT and regenerate the code.`;
                    }

                    // Lower priority: RAG Context
                    systemPrompt += `\n\n=== REFERENCE CONTEXT (READ ONLY) ===\n${contextFiles.map(f => `File: ${f.fileName}\n${f.content.slice(0, 5000)}`).join('\n---\n')}`;

                    const coderRes = await nextjsCoderAgent.generate(systemPrompt, {
                        structuredOutput: {
                            schema: z.object({
                                files: z.array(z.object({ path: z.string(), content: z.string() })),
                                explanation: z.string().optional()
                            })
                        }
                    });

                    const files = coderRes.object?.files || [];
                    if (files.length === 0) {
                        console.warn("  No files generated.");
                        feedback = "No files were generated. Please generate the necessary files.";
                        continue; // Skip review if no files
                    }

                    // Capture generated files for next attempt (if rejected)
                    generatedFiles = files;

                    // 3. Review
                    console.log(`  [Attempt ${attempt}] Reviewing ${files.length} files...`);
                    const criticRes = await codeCriticAgent.generate(JSON.stringify(files), {
                        structuredOutput: {
                            schema: z.object({
                                approved: z.boolean(),
                                score: z.number(),
                                issues: z.array(z.object({ file: z.string(), issue: z.string() })),
                                summary: z.string(),
                            })
                        }
                    });

                    const review = criticRes.object;
                    if (review?.approved) {
                        console.log(`  [Attempt ${attempt}] Approved! (Score: ${review.score})`);
                        approved = true;
                        break; // Exit ReAct loop
                    } else {
                        feedback = review?.summary || "Code not approved.";
                        console.log(`  [Attempt ${attempt}] Rejected. Feedback: ${feedback}`);
                    }

                } catch (e) {
                    console.error(`  [Attempt ${attempt}] Error:`, e);
                    feedback = "An error occurred during generation. Please try again.";
                }
            }

            // 4. Commit & Index (Sequential Context Update)
            if (approved && generatedFiles.length > 0) {
                try {
                    console.log(`  Committing Task ${task.id}...`);
                    await commitFilesToBranch(owner, repoName, "main", generatedFiles, `feat: Task ${task.id}`, process.env.GITHUB_TOKEN || "");

                    console.log(`  Updating Vector Store for Task ${task.id}...`);
                    for (const file of generatedFiles) {
                        if (shouldSkipFile(file.path, file.content)) continue;
                        const chunks = chunkText(file.content, 3000);
                        for (let i = 0; i < chunks.length; i++) {
                            const chunkId = `${owner}-${repoName}-${file.path}-chunk-${i}-${Date.now()}`; // Unique ID to avoid collision or overwrite
                            await storeVector({
                                id: chunkId,
                                data: chunks[i],
                                metadata: { fileName: file.path.split("/").pop(), filePath: file.path, repoName, owner }
                            });
                        }
                    }
                    completedCount++;
                } catch (commitErr) {
                    console.error(`  Commit/Index failed for Task ${task.id}`, commitErr);
                    failedCount++;
                }
            } else {
                console.log(`  Task ${task.id} Failed after 3 attempts.`);
                failedCount++;
            }
        }

        return { completedCount, failedCount };
    }
});

// --- MAIN WORKFLOW ---

const syncProjectState = createStep({
    id: "sync-project-state",
    inputSchema: developmentInputSchema,
    outputSchema: z.array(TaskSchema),
    stateSchema: sharedStateSchema,
    execute: async ({ inputData, setState }) => {
        try {
            const [owner, repoName] = inputData.repositoryName.split("/");
            if (!owner || !repoName) throw new Error("Invalid repo");

            const files = await fetchAllRepositoryFiles(owner, repoName, process.env.GITHUB_TOKEN || "");
            const tasksFile = files.find(f => f.path.toLowerCase() === "tasks.md");
            if (!tasksFile) return [];

            const tasks = JSON.parse(tasksFile.content.match(/```json\n([\s\S]*?)\n```/)?.[1] || "[]");

            console.log(`[sync-project-state] Initial sync. ${tasks.length} tasks found.`);

            // Initial Vector Sync
            try {
                await removeVectors({ prefix: `${owner}-${repoName}-` });
                for (const file of files) {
                    if (shouldSkipFile(file.path, file.content)) continue;
                    const chunks = chunkText(file.content, 3000);
                    for (let i = 0; i < chunks.length; i++) {
                        const chunkId = `${owner}-${repoName}-${file.path}-chunk-${i}`;
                        await storeVector({
                            id: chunkId, data: chunks[i],
                            metadata: { fileName: file.path.split("/").pop(), filePath: file.path, repoName, owner },
                        });
                    }
                }
            } catch (vecErr) {
                console.error("Vector sync error (non-fatal)", vecErr);
            }

            setState({ owner, repoName });
            return tasks;
        } catch (e) {
            console.error("Sync failed", e);
            return [];
        }
    }
});

export const developmentWorkflow = createWorkflow({
    id: "development-workflow",
    inputSchema: developmentInputSchema,
    outputSchema: z.object({ completedCount: z.number(), failedCount: z.number() }),
    stateSchema: sharedStateSchema,
    steps: [syncProjectState, processQueueStep],
})
    .then(syncProjectState)
    .then(processQueueStep)
    .commit();
