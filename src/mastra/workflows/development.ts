import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { fetchAllRepositoryFiles, commitFilesToBranch } from "@/lib/git";
import { storeVector, removeVectors, searchVector } from "@/lib/vector";
import { updateSubtaskCompleted } from "@/lib/tasks";
import { nextjsCoderAgent } from "../agents/nextjs-coder";
import { codeCriticAgent } from "../agents/code-critic";

// --- Constants ---
const MAX_FILE_SIZE = 50000;
const SKIP_PATTERNS = [
    'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '.lock',
    '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf',
    '.mp4', '.mp3', '.webm', '.pdf', '.zip', '.tar', '.gz',
    'node_modules/', '.next/', 'dist/', '.git/', '.md', 'tasks.json'
];

// --- Helpers ---
function shouldSkipFile(filePath: string, content: string): boolean {
    if (SKIP_PATTERNS.some(p => filePath.toLowerCase().includes(p.toLowerCase()))) return true;
    if (content.length > MAX_FILE_SIZE) return true;
    return false;
}

function chunkText(text: string, maxChars = 3000): string[] {
    const chunks: string[] = [];
    let current = "";
    for (const line of text.split('\n')) {
        if (current.length + line.length > maxChars) {
            if (current.trim()) chunks.push(current.trim());
            current = line;
        } else {
            current += (current ? '\n' : '') + line;
        }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

// --- Group Definitions ---
const GROUP_ORDER = ["core", "ui", "functionality"] as const;
type GroupId = typeof GROUP_ORDER[number];

// --- Schemas ---
const TaskSchema = z.object({
    id: z.union([z.number(), z.string()]),
    title: z.string(),
    description: z.string(),
    dependencies: z.array(z.union([z.number(), z.string()])).optional(),
    status: z.string().optional().default("pending"),
    group: z.enum(GROUP_ORDER).optional().default("core"),
});

const GroupDataSchema = z.object({
    tasks: z.array(TaskSchema),
    repoName: z.string(),
    owner: z.string(),
});

const SyncOutputSchema = z.object({
    core: GroupDataSchema,
    ui: GroupDataSchema,
    functionality: GroupDataSchema,
});

const GroupResultSchema = z.object({
    groupId: z.string(),
    completed: z.number(),
    failed: z.number(),
    syncData: SyncOutputSchema, // Pass through for next group
});

// --- Group-Specific Instructions ---
const CODER_INSTRUCTIONS: Record<GroupId, string> = {
    core: `You are a Next.js PROJECT SETUP & CONFIGURATION specialist.
Focus on: Project initialization, TypeScript config, Tailwind setup, folder structure, utilities.
Quality: Use TypeScript strict mode, follow Next.js 14+ App Router conventions.`,

    ui: `You are a Next.js UI/UX & COMPONENT specialist.
Focus on: React components, Tailwind styling, layouts, themes, responsive design, accessibility.
Quality: Use semantic HTML, proper component composition, mobile-first design.`,

    functionality: `You are a Next.js BUSINESS LOGIC & API specialist.
Focus on: API routes, Server Actions, state management, data fetching, authentication.
Quality: Use TypeScript for type safety, proper error handling, input validation.`,
};

const CRITIC_INSTRUCTIONS: Record<GroupId, string> = {
    core: `Review SETUP & CONFIGURATION code.
Check: TypeScript config, Next.js conventions, env handling, folder organization.`,

    ui: `Review UI COMPONENT code.
Check: 'use client' directive, accessibility, responsive Tailwind, component reusability.`,

    functionality: `Review BUSINESS LOGIC code.
Check: Type safety, error handling, input validation, secure API patterns.`,
};

// --- Sync Step ---
const syncProjectStep = createStep({
    id: "sync-project",
    description: "Fetches repository files and groups tasks by category",
    inputSchema: z.object({ repositoryName: z.string() }),
    outputSchema: SyncOutputSchema,
    execute: async ({ inputData }) => {
        const [owner, repoName] = inputData.repositoryName.split("/");
        if (!owner || !repoName) throw new Error("Invalid repository format");

        const files = await fetchAllRepositoryFiles(owner, repoName, process.env.GITHUB_TOKEN || "");
        const tasksFile = files.find(f => f.path === "tasks.json");
        if (!tasksFile) throw new Error("tasks.json not found");

        const rawTasks = JSON.parse(tasksFile.content) as z.infer<typeof TaskSchema>[];
        const grouped: Record<GroupId, z.infer<typeof TaskSchema>[]> = {
            core: [],
            ui: [],
            functionality: []
        };

        for (const t of rawTasks) {
            const gid = (t.group || "core") as GroupId;
            grouped[gid].push(t);
        }

        console.log(`[sync] Tasks: core=${grouped.core.length}, ui=${grouped.ui.length}, functionality=${grouped.functionality.length}`);

        // Vector sync
        await removeVectors({ prefix: `${repoName}-` });
        for (const f of files) {
            if (shouldSkipFile(f.path, f.content)) continue;
            for (const [i, chunk] of chunkText(f.content).entries()) {
                await storeVector({ id: `${repoName}-${f.path}-${i}`, data: chunk, metadata: { filePath: f.path } });
            }
        }

        return {
            core: { tasks: grouped.core, repoName, owner },
            ui: { tasks: grouped.ui, repoName, owner },
            functionality: { tasks: grouped.functionality, repoName, owner },
        };
    }
});

// --- Generic Group Processing Function ---
async function processGroup(
    groupId: GroupId,
    groupData: z.infer<typeof GroupDataSchema>
): Promise<{ completed: number; failed: number }> {
    const tasks = groupData.tasks.filter((t: any) => t.status === "pending");
    const { repoName, owner } = groupData;

    if (tasks.length === 0) {
        console.log(`\n[${groupId}] No pending tasks, skipping.`);
        return { completed: 0, failed: 0 };
    }

    console.log(`\n========================================`);
    console.log(`  [${groupId.toUpperCase()}] Processing ${tasks.length} tasks`);
    console.log(`========================================`);

    let completed = 0;
    let failed = 0;

    for (const task of tasks) {
        console.log(`\n[${groupId}] Task ${task.id}: ${task.title}`);

        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

        const context = await searchVector({ data: `${task.title} ${task.description}`, topK: 5 });

        let feedback = "";
        let files: { path: string; content: string }[] = [];
        let commitMsg = "";
        let approved = false;
        let filesWithIssues: { path: string; content: string; issue: string; line: number; fix: string }[] = [];

        // ReAct Loop (3 attempts)
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`  Attempt ${attempt}/3 - Generating code...`);

                // Add delay before API call to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));

                let prompt = `${CODER_INSTRUCTIONS[groupId]}

TASK: ${task.title}
DESCRIPTION: ${task.description}
REPOSITORY: ${repoName}`;

                if (attempt > 1) {
                    // Always include previous files for context on subsequent attempts
                    if (files.length > 0) {
                        prompt += `\n\nPREVIOUS ATTEMPT:\n${files.map((f: any) => `// ${f.path}\n${f.content}`).join('\n')}`;
                    }

                    // Always include critic feedback if available
                    if (feedback) {
                        prompt += `\n\nCRITIC FEEDBACK (MUST ADDRESS ALL ISSUES):\n${feedback}`;
                    }

                    // If we have specific files with issues, highlight them
                    if (filesWithIssues.length > 0) {
                        prompt += `\n\nFILES WITH ISSUES TO FIX: ${filesWithIssues.map(f => f.path).join(', ')}`;
                        prompt += `\n\nSPECIFIC ISSUES BY FILE:\n${filesWithIssues.map(f =>
                            `- ${f.path} (line ${f.line}): ${f.issue}\n  SUGGESTED FIX: ${f.fix}`
                        ).join('\n')}`;
                    }
                }
                prompt += `\n\nCODEBASE CONTEXT:\n${context.map((r: any) => r.data?.slice(0, 3000)).join('\n---\n')}`;

                const res = await nextjsCoderAgent.generate(prompt, {
                    structuredOutput: {
                        schema: z.object({
                            files: z.array(z.object({ path: z.string(), content: z.string() })),
                            commitMessage: z.string(),
                        })
                    }
                });

                console.log(`  Generated response:`, JSON.stringify(res.object, null, 2));

                files = res.object?.files || [];
                commitMsg = res.object?.commitMessage || "";

                console.log(`  Files count: ${files.length}, Commit message: "${commitMsg}"`);

                if (!files.length) {
                    feedback = "No files generated";
                    continue;
                }

                console.log(`  Attempt ${attempt}/3 - Reviewing code...`);

                // Add delay before critic API call to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
                const criticPrompt = `${CRITIC_INSTRUCTIONS[groupId]}

TASK CONTEXT:
Task: ${task.title}
Description: ${task.description}
Attempt: ${attempt}/3

FILES TO REVIEW:
${JSON.stringify(files, null, 2)}

${attempt > 1 ? `PREVIOUS FEEDBACK: ${feedback}` : ''}`;

                const review = await codeCriticAgent.generate(criticPrompt, {
                    structuredOutput: {
                        schema: z.object({
                            approved: z.boolean(),
                            score: z.number(),
                            issues: z.array(z.object({
                                severity: z.enum(["critical", "major", "minor"]),
                                file: z.string(),
                                line: z.number(),
                                issue: z.string(),
                                fix: z.string()
                            })),
                            strengths: z.array(z.string()),
                            summary: z.string()
                        })
                    }
                });

                console.log(`  Critic response:`, JSON.stringify(review.object, null, 2));

                if (review.object?.approved) {
                    console.log(`  ✓ APPROVED (Score: ${review.object?.score})`);
                    approved = true;
                    break;
                } else {
                    feedback = review.object?.summary || "Not approved";
                    console.log(`  ✗ REJECTED (Score: ${review.object?.score}): ${feedback}`);

                    // Extract files with issues for targeted re-generation
                    const issues = review.object?.issues || [];

                    // Create filesWithIssues array with actual file content from the previous attempt
                    filesWithIssues = issues.map((issue: {
                        file: string;
                        severity: "critical" | "major" | "minor";
                        line: number;
                        issue: string;
                        fix: string;
                    }) => {
                        const originalFile = files.find(file => file.path === issue.file);
                        return {
                            path: issue.file,
                            content: originalFile?.content || "",
                            issue: issue.issue,
                            line: issue.line,
                            fix: issue.fix
                        };
                    }) || [];

                    if (filesWithIssues.length > 0) {
                        console.log(`  Files with issues: ${filesWithIssues.map(f => `${f.path}:${f.line}`).join(', ')}`);

                        // Enhance the feedback with specific file information
                        const detailedFeedback = filesWithIssues.map(f =>
                            `- ${f.path} (line ${f.line}): ${f.issue}\n  FIX: ${f.fix}`
                        ).join('\n');

                        feedback = `${review.object?.summary || "Code not approved"}\n\nFILES WITH ISSUES: ${filesWithIssues.map(f => f.path).join(', ')}\n\nDETAILED ISSUES AND FIXES:\n${detailedFeedback}`;

                        // Keep all files for context, but the prompt will highlight which ones need fixing
                        // This ensures the coder has full context while knowing what to fix
                    } else {
                        // If no specific file issues, include general feedback
                        if (review.object?.issues && review.object.issues.length > 0) {
                            // There are issues but they might not be mapped to specific files
                            feedback = `${review.object?.summary || "Code not approved"}\n\nGENERAL ISSUES TO ADDRESS:\n${review.object.issues.map(issue =>
                                `- ${issue.severity}: ${issue.issue}\n  FIX: ${issue.fix}`
                            ).join('\n')}`;
                        }

                        // Include previous commit message in feedback for context
                        if (commitMsg) {
                            feedback += `\n\nPREVIOUS COMMIT MESSAGE: "${commitMsg}"`;
                            feedback += `\nPREVIOUS FILES: ${files.map(f => f.path).join(', ')}`;
                        }
                    }
                }
            } catch (e: any) {
                console.error(`  Error: ${e.message}`);

                // Handle rate limiting specifically
                if (e.message.includes('并发数过高') || e.message.includes('1302') || e.statusCode === 429) {
                    console.log(`  Rate limit hit, waiting 10 seconds before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    feedback = "Rate limit hit, retrying with delay";
                } else {
                    feedback = "Error occurred during generation";
                }
            }
        }

        if (approved && files.length > 0) {
            try {
                console.log(`  Committing: ${commitMsg}`);
                await commitFilesToBranch(owner, repoName, "main", files, commitMsg, process.env.GITHUB_TOKEN || "");

                for (const f of files) {
                    if (shouldSkipFile(f.path, f.content)) continue;
                    for (const [i, chunk] of chunkText(f.content).entries()) {
                        await storeVector({
                            id: `${repoName}-${f.path}-${i}-${Date.now()}`,
                            data: chunk,
                            metadata: { filePath: f.path }
                        });
                    }
                }

                // Update the task status in tasks.json
                try {
                    updateSubtaskCompleted({
                        tasksPath: './tasks.json',
                        subtaskId: task.id.toString(),
                        completionTime: new Date().toISOString(),
                        notes: `Completed: ${task.title}`
                    });
                    console.log(`  Updated task ${task.id} status in tasks.json`);
                } catch (taskErr: any) {
                    console.warn(`  Failed to update task status: ${taskErr.message}`);
                }

                completed++;
            } catch (err: any) {
                console.error(`  Commit failed: ${err.message}`);
                failed++;
            }
        } else {
            failed++;
        }
    }

    console.log(`\n[${groupId.toUpperCase()}] Complete: ${completed} succeeded, ${failed} failed`);
    return { completed, failed };
}

// --- Step 1: Process CORE Group ---
const processCoreStep = createStep({
    id: "process-core",
    description: "Processes CORE group tasks (setup, config, utilities)",
    inputSchema: SyncOutputSchema,
    outputSchema: GroupResultSchema,
    execute: async ({ inputData }) => {
        const result = await processGroup("core", inputData.core);
        return {
            groupId: "core",
            completed: result.completed,
            failed: result.failed,
            syncData: inputData, // Pass through for next step
        };
    }
});

// --- Step 2: Process UI Group ---
const processUiStep = createStep({
    id: "process-ui",
    description: "Processes UI group tasks (components, styling)",
    inputSchema: GroupResultSchema,
    outputSchema: GroupResultSchema,
    execute: async ({ inputData }) => {
        const result = await processGroup("ui", inputData.syncData.ui);
        return {
            groupId: "ui",
            completed: inputData.completed + result.completed,
            failed: inputData.failed + result.failed,
            syncData: inputData.syncData,
        };
    }
});

// --- Step 3: Process FUNCTIONALITY Group ---
const processFunctionalityStep = createStep({
    id: "process-functionality",
    description: "Processes FUNCTIONALITY group tasks (API, logic)",
    inputSchema: GroupResultSchema,
    outputSchema: z.object({ completedCount: z.number(), failedCount: z.number() }),
    execute: async ({ inputData }) => {
        const result = await processGroup("functionality", inputData.syncData.functionality);

        const totalCompleted = inputData.completed + result.completed;
        const totalFailed = inputData.failed + result.failed;

        console.log(`\n========================================`);
        console.log(`  ALL GROUPS COMPLETE`);
        console.log(`  Total: ${totalCompleted} succeeded, ${totalFailed} failed`);
        console.log(`========================================\n`);

        return { completedCount: totalCompleted, failedCount: totalFailed };
    }
});

// --- Group Processing Workflow ---
const groupProcessingWorkflow = createWorkflow({
    id: "group-processing-workflow",
    inputSchema: SyncOutputSchema,
    outputSchema: z.object({ completedCount: z.number(), failedCount: z.number() }),
    steps: [processCoreStep, processUiStep, processFunctionalityStep],
})
    .then(processCoreStep)       // Phase 1: Core setup
    // .then(processUiStep)         // Phase 2: UI components  
    // .then(processFunctionalityStep) // Phase 3: Business logic
    .commit();

// --- Main Workflow ---
export const developmentWorkflow = createWorkflow({
    id: "development-workflow",
    inputSchema: z.object({ repositoryName: z.string() }),
    outputSchema: z.object({ completedCount: z.number(), failedCount: z.number() }),
    steps: [syncProjectStep, groupProcessingWorkflow],
})
    .then(syncProjectStep)
    .then(groupProcessingWorkflow)
    .commit();
