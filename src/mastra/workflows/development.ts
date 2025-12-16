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

function createNamespace(owner: string, repoName: string): string {
    return `${owner}-${repoName}`;
}

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
    stateSchema: z.object({
        tasks: z.array(TaskSchema),
        repoName: z.string(),
        owner: z.string(),
    }),
    execute: async ({ inputData, setState }) => {
        const [owner, repoName] = inputData.repositoryName.split("/");
        if (!owner || !repoName) throw new Error("Invalid repository format");

        const namespace = createNamespace(owner, repoName);

        const files = await fetchAllRepositoryFiles(owner, repoName, process.env.GITHUB_TOKEN || "");
        const tasksFile = files.find(f => f.path === "tasks.json");
        if (!tasksFile) throw new Error("tasks.json not found");

        const rawTasks = JSON.parse(tasksFile.content) as z.infer<typeof TaskSchema>[];
        const pendingTasks = rawTasks.filter(t => t.status === "pending");
        const grouped: Record<GroupId, z.infer<typeof TaskSchema>[]> = {
            core: [],
            ui: [],
            functionality: []
        };

        for (const t of pendingTasks) {
            const gid = (t.group || "core") as GroupId;
            grouped[gid].push(t);
        }

        console.log(`[sync] Tasks: core=${grouped.core.length}, ui=${grouped.ui.length}, functionality=${grouped.functionality.length}`);

        // Vector sync
        try {
            await removeVectors({ prefix: `${namespace}-`, namespace: namespace });
        }
        catch (error) {
            console.error(`[sync] Error removing vectors: ${error}`);
        }
        try {
            for (const f of files) {
                if (shouldSkipFile(f.path, f.content)) continue;
                for (const [i, chunk] of chunkText(f.content).entries()) {
                    await storeVector({ id: `${namespace}-${f.path}-${i}`, data: chunk, metadata: { filePath: f.path }, namespace: namespace });
                }
            }

            setState({
                tasks: pendingTasks,
                repoName,
                owner,
            });

            return {
                core: { tasks: grouped.core, repoName, owner },
                ui: { tasks: grouped.ui, repoName, owner },
                functionality: { tasks: grouped.functionality, repoName, owner },
                repositoryName: inputData.repositoryName,
            };
        }
        catch (error) {
            console.error(`[sync] Error syncing vectors: ${error}`);
            return {
                core: { tasks: [], repoName, owner },
                ui: { tasks: [], repoName, owner },
                functionality: { tasks: [], repoName, owner },
                repositoryName: inputData.repositoryName,
            };
        }
    }
});

// --- Generic Group Processing Function ---
async function processGroup(
    groupId: GroupId,
    groupData: z.infer<typeof GroupDataSchema>,
    currentTasks: z.infer<typeof TaskSchema>[],
    repoName: string,
    owner: string,
    setState?: (state: { tasks: z.infer<typeof TaskSchema>[]; repoName: string; owner: string }) => void
): Promise<{ completed: number; failed: number; updatedTasks?: z.infer<typeof TaskSchema>[] }> {
    const tasks = groupData.tasks.filter((t: z.infer<typeof TaskSchema>) => t.status === "pending");

    if (tasks.length === 0) {
        console.log(`\n[${groupId}] No pending tasks, skipping.`);
        return { completed: 0, failed: 0 };
    }

    console.log(`\n========================================`);
    console.log(`  [${groupId.toUpperCase()}] Processing ${tasks.length} tasks`);
    console.log(`========================================`);

    let completed = 0;
    let failed = 0;

    const namespace = createNamespace(owner, repoName);

    for (const task of tasks) {
        // Add delay between processing different tasks
        if (completed > 0 || failed > 0) {
            console.log(`  Adding 5-second delay before processing next task...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.log(`\n[${groupId}] Task ${task.id}: ${task.title}`);


        const context = await searchVector({ data: `${task.title} ${task.description}`, topK: 10, namespace: namespace });
        console.log(`Context for task ${task.title}:`);
        console.log(context.map(c => `File: ${c?.metadata?.filePath}, Score: ${c?.score}, Content Preview: ${c?.data?.slice(0, 100)}...`).join("\n"));
        let feedback = "";
        let files: { path: string; content: string }[] = [];
        let commitMsg = "";
        let approved = false;
        let filesWithIssues: { path: string; content: string; issue: string; line: number; fix: string }[] = [];
        let lastReview: any = null; // Store the last review for fallback assessment

        // ReAct Loop (3 attempts)
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                // Add a small delay between attempts to prevent rate limiting
                if (attempt > 1) {
                    console.log(`  Adding 3-second delay between attempts...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }

                console.log(`  Attempt ${attempt}/3 - Generating code...`);


                let prompt = `${CODER_INSTRUCTIONS[groupId]}

TASK: ${task.title}
DESCRIPTION: ${task.description}
REPOSITORY: ${repoName}
NAMESPACE: ${namespace}`;

                if (attempt > 1) {
                    // For subsequent attempts, focus only on files with issues to reduce token consumption
                    if (filesWithIssues.length > 0) {
                        prompt += `\n\nFOCUSED FIX REQUEST - Only addressing files with issues:\n`;

                        // Include only the files that have issues with their current content
                        prompt += `\nFILES TO FIX:\n${filesWithIssues.map(f => `// ${f.path}\n${f.content}`).join('\n\n')}`;

                        // Include the specific issues and fixes for each file
                        prompt += `\n\nSPECIFIC ISSUES BY FILE:\n${filesWithIssues.map(f =>
                            `- ${f.path} (line ${f.line}): ${f.issue}\n  SUGGESTED FIX: ${f.fix}`
                        ).join('\n')}`;

                        // Add instruction to only modify files with issues
                        prompt += `\n\nIMPORTANT: Only modify the files listed above. Keep other files unchanged.`;
                    } else {
                        // If no specific file issues, include all files (fallback behavior)
                        if (files.length > 0) {
                            prompt += `\n\nPREVIOUS ATTEMPT:\n${files.map((f: any) => `// ${f.path}\n${f.content}`).join('\n')}`;
                        }
                    }

                    // Always include critic feedback if available
                    if (feedback) {
                        prompt += `\n\nCRITIC FEEDBACK (MUST ADDRESS ALL ISSUES):\n${feedback}`;
                    }
                } else {
                    // For first attempt, include full codebase context
                    const contextWithContent = context.map((r: any) => {
                        // Handle different possible response structures from Upstash Vector
                        const content = r.data || '';
                        return content ? `File: ${r.metadata?.filePath || 'unknown'}\n${content.slice(0, 3000)}` : `File: ${r.metadata?.filePath || 'unknown'}\n[No content available]`;
                    });
                    prompt += `\n\nCODEBASE CONTEXT:\n${contextWithContent.join('\n---\n')}`;
                }

                // Add delay to prevent API rate limiting
                console.log(`  Adding 2-second delay before calling nextjsCoderAgent...`);
                await new Promise(resolve => setTimeout(resolve, 2000));

                console.log(`  Calling nextjsCoderAgent with prompt length: ${prompt.length}`);

                let res;
                let fallbackUsed = false;

                try {
                    res = await nextjsCoderAgent.generate(prompt, {
                        structuredOutput: {
                            schema: z.object({
                                files: z.array(z.object({ path: z.string(), content: z.string() })),
                                commitMessage: z.string(),
                            })
                        }
                    });
                } catch (validationError: any) {
                    // Try to get the raw response if available
                    if (validationError.rawResponse) {
                        // Try to parse the raw response as JSON
                        try {
                            const rawText = typeof validationError.rawResponse === 'string'
                                ? validationError.rawResponse
                                : JSON.stringify(validationError.rawResponse);

                            // Try to extract JSON from the raw response
                            let jsonMatch = rawText.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                const parsed = JSON.parse(jsonMatch[0]);

                                // Validate the parsed object
                                if (parsed.files && Array.isArray(parsed.files) && parsed.commitMessage && typeof parsed.commitMessage === 'string') {
                                    res = { object: parsed };
                                    fallbackUsed = true;
                                }
                            }
                        } catch (parseError: any) {
                            // Parsing failed, will use minimal fallback
                        }
                    }

                    if (!res) {
                        // Create a minimal valid response as last resort
                        res = {
                            object: {
                                files: [],
                                commitMessage: "fix: fallback response due to validation error"
                            }
                        };
                        fallbackUsed = true;
                    }
                }

                if (fallbackUsed) {
                    console.log(`  WARNING: Used fallback response due to validation error`);
                }

                // Validate the structured output
                if (!res.object) {
                    throw new Error('No object in response from nextjsCoderAgent');
                }

                if (!Array.isArray(res.object.files)) {
                    throw new Error('Files is not an array in response from nextjsCoderAgent');
                }

                if (typeof res.object.commitMessage !== 'string') {
                    throw new Error('CommitMessage is not a string in response from nextjsCoderAgent');
                }

                files = res.object.files;
                commitMsg = res.object.commitMessage;

                console.log(`  Files count: ${files.length}, Commit message: "${commitMsg}"`);

                // For subsequent attempts with focused fixes, we need to merge the fixed files
                // with the unchanged files from the previous attempt
                if (attempt > 1 && filesWithIssues.length > 0) {
                    // Get the list of files that were supposed to be fixed
                    const filesToFix = filesWithIssues.map(f => f.path);

                    // Check if all files that needed fixing were returned
                    const allFixedFilesReturned = filesToFix.every(path =>
                        files.some(f => f.path === path)
                    );

                    if (!allFixedFilesReturned) {
                        console.warn(`  Warning: Not all files with issues were returned in the fix attempt`);
                        console.warn(`  Expected files: ${filesToFix.join(', ')}`);
                        console.warn(`  Returned files: ${files.map(f => f.path).join(', ')}`);
                    }

                    // For focused fixes, we assume the other files remain unchanged
                    // The agent should only return the files that were modified
                    console.log(`  Focused fix mode: Only ${files.length} files modified out of ${filesToFix.length + (files.length - filesToFix.length)} total files`);
                }

                if (!files.length) {
                    feedback = "No files generated";
                    continue;
                }

                console.log(`  Attempt ${attempt}/3 - Reviewing code...`);

                const criticPrompt = `${CRITIC_INSTRUCTIONS[groupId]}

TASK CONTEXT:
Task: ${task.title}
Description: ${task.description}
Attempt: ${attempt}/3

FILES TO REVIEW:
${JSON.stringify(files, null, 2)}

${attempt > 1 ? `PREVIOUS FEEDBACK: ${feedback}` : ''}`;

                // Add delay to prevent API rate limiting
                console.log(`  Adding 1.5-second delay before calling codeCriticAgent...`);
                await new Promise(resolve => setTimeout(resolve, 1500));

                console.log(`  Calling codeCriticAgent with prompt length: ${criticPrompt.length}`);

                let review;
                let criticFallbackUsed = false;

                try {
                    review = await codeCriticAgent.generate(criticPrompt, {
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
                } catch (criticValidationError: any) {
                    // Try to get the raw response if available
                    if (criticValidationError.rawResponse) {
                        // Try to parse the raw response as JSON
                        try {
                            const rawText = typeof criticValidationError.rawResponse === 'string'
                                ? criticValidationError.rawResponse
                                : JSON.stringify(criticValidationError.rawResponse);

                            // Try to extract JSON from the raw response
                            let jsonMatch = rawText.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                const parsed = JSON.parse(jsonMatch[0]);

                                // Validate the parsed object with more flexible requirements
                                if (typeof parsed.approved === 'boolean' && typeof parsed.score === 'number') {
                                    // Ensure required arrays exist
                                    if (!Array.isArray(parsed.issues)) parsed.issues = [];
                                    if (!Array.isArray(parsed.strengths)) parsed.strengths = [];
                                    if (typeof parsed.summary !== 'string') parsed.summary = "Review completed";

                                    review = { object: parsed };
                                    criticFallbackUsed = true;
                                }
                            }
                        } catch (parseError: any) {
                            // Parsing failed, will use minimal fallback
                        }
                    }

                    if (!review) {
                        // Create a minimal valid response as last resort
                        review = {
                            object: {
                                approved: false,
                                score: 5,
                                issues: [],
                                strengths: [],
                                summary: "Fallback review due to validation error"
                            }
                        };
                        criticFallbackUsed = true;
                    }
                }

                if (criticFallbackUsed) {
                    console.log(`  WARNING: Used fallback critic response due to validation error`);
                }

                // Validate the critic structured output
                if (!review.object) {
                    throw new Error('No object in response from codeCriticAgent');
                }

                if (typeof review.object.approved !== 'boolean') {
                    throw new Error('Approved is not a boolean in response from codeCriticAgent');
                }

                if (typeof review.object.score !== 'number') {
                    throw new Error('Score is not a number in response from codeCriticAgent');
                }

                if (!Array.isArray(review.object.issues)) {
                    throw new Error('Issues is not an array in response from codeCriticAgent');
                }

                if (!Array.isArray(review.object.strengths)) {
                    throw new Error('Strengths is not an array in response from codeCriticAgent');
                }

                if (typeof review.object.summary !== 'string') {
                    throw new Error('Summary is not a string in response from codeCriticAgent');
                }


                // Store the review for potential fallback use
                lastReview = review;

                if (review?.object?.approved) {
                    console.log(`  ✓ APPROVED (Score: ${review?.object?.score})`);
                    approved = true;
                    break;
                } else {
                    feedback = review?.object?.summary || "Not approved";
                    console.log(`  ✗ REJECTED (Score: ${review?.object?.score}): ${feedback}`);

                    // Extract files with issues for targeted re-generation
                    const issues = review?.object?.issues || [];

                    // Create filesWithIssues array with actual file content from the previous attempt
                    // Group issues by file to avoid duplicates
                    const issuesByFile = new Map<string, any>();

                    issues.forEach((issue: {
                        file: string;
                        severity: "critical" | "major" | "minor";
                        line: number;
                        issue: string;
                        fix: string;
                    }) => {
                        if (!issuesByFile.has(issue.file)) {
                            const originalFile = files.find(file => file.path === issue.file);
                            issuesByFile.set(issue.file, {
                                path: issue.file,
                                content: originalFile?.content || "",
                                issues: [],
                                fixes: []
                            });
                        }

                        const fileEntry = issuesByFile.get(issue.file)!;
                        fileEntry.issues.push({
                            line: issue.line,
                            description: issue.issue,
                            severity: issue.severity
                        });
                        fileEntry.fixes.push({
                            line: issue.line,
                            fix: issue.fix,
                            severity: issue.severity
                        });
                    });

                    // Convert map to array and format for the prompt
                    filesWithIssues = Array.from(issuesByFile.values()).map(fileEntry => ({
                        path: fileEntry.path,
                        content: fileEntry.content,
                        issue: fileEntry.issues.map((i: any) =>
                            `${i.severity}: ${i.description} (line ${i.line})`
                        ).join('; '),
                        line: fileEntry.issues[0]?.line || 0, // Use first issue's line as reference
                        fix: fileEntry.fixes.map((f: any) =>
                            `${f.severity}: ${f.fix} (line ${f.line})`
                        ).join('; ')
                    }));

                    if (filesWithIssues.length > 0) {
                        console.log(`  Files with issues: ${filesWithIssues.map(f => `${f.path}:${f.line}`).join(', ')}`);

                        // Enhance the feedback with specific file information
                        const detailedFeedback = filesWithIssues.map(f =>
                            `- ${f.path} (line ${f.line}): ${f.issue}\n  FIX: ${f.fix}`
                        ).join('\n');

                        feedback = `${review?.object?.summary || "Code not approved"}\n\nFILES WITH ISSUES: ${filesWithIssues.map(f => f.path).join(', ')}\n\nDETAILED ISSUES AND FIXES:\n${detailedFeedback}`;

                        // Keep all files for context, but the prompt will highlight which ones need fixing
                        // This ensures the coder has full context while knowing what to fix
                    } else {
                        // If no specific file issues, include general feedback
                        if (review?.object?.issues && review.object.issues.length > 0) {
                            // There are issues but they might not be mapped to specific files
                            feedback = `${review?.object?.summary || "Code not approved"}\n\nGENERAL ISSUES TO ADDRESS:\n${review.object.issues.map((issue: any) =>
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
                // Handle rate limiting specifically
                if (e.message.includes('并发数过高') || e.message.includes('1302') || e.message.includes('rate limit') || e.statusCode === 429) {
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    feedback = "Rate limit hit, retrying with delay";
                } else {
                    feedback = "Error occurred during generation";
                }
            }
        }

        // Fallback mechanism: If we've exhausted all attempts and have files that are "good enough"
        if (!approved && files.length > 0 && lastReview?.object) {
            console.log(`  All 3 attempts exhausted. Checking if code is acceptable for fallback...`);

            // Check if we have a review with a score that's "good enough" (6-7)
            if (typeof lastReview.object.score === 'number' && lastReview.object.score >= 6) {
                console.log(`  ✓ FALLBACK APPROVAL (Score: ${lastReview.object.score}): Code meets minimum acceptance criteria after 3 attempts`);

                // Only allow fallback if there are no critical issues
                const hasCriticalIssues = lastReview.object.issues?.some((issue: any) => issue.severity === 'critical');
                if (!hasCriticalIssues) {
                    approved = true;
                    console.log(`  ✓ FALLBACK: No critical issues found, accepting code with score ${lastReview.object.score}`);
                } else {
                    console.log(`  ✗ FALLBACK REJECTED: Critical issues remain, cannot accept code`);
                }
            } else {
                console.log(`  ✗ FALLBACK REJECTED: Score too low (${lastReview.object.score || 'unknown'}) for fallback approval`);
            }
        }

        if (approved && files.length > 0) {
            try {
                // For focused fixes (attempt > 1), we need to include all files
                // from previous attempts that weren't modified in this round
                let filesToCommit = files;
                let allPreviousFiles: { path: string; content: string }[] = [];

                // Store all files from all attempts for the final commit
                if (filesWithIssues.length > 0) {
                    // Get the paths of files that were supposed to be fixed
                    const fixedFilePaths = new Set(files.map(f => f.path));
                    const filesWithIssuesPaths = new Set(filesWithIssues.map(f => f.path));

                    // We need to track all files from all attempts
                    // For simplicity, we'll use the files from the last attempt as the base
                    // and update them with any fixed files
                    allPreviousFiles = [...files];

                    console.log(`  Focused fix mode: ${files.length} files returned for commit`);
                } else {
                    allPreviousFiles = files;
                }

                // Create a more descriptive commit message for task completion
                const taskCompletionCommitMsg = `feat: ${task.title}`;

                console.log(`  Committing: ${taskCompletionCommitMsg}`);
                await commitFilesToBranch(owner, repoName, "main", allPreviousFiles, taskCompletionCommitMsg, process.env.GITHUB_TOKEN || "");

                for (const f of allPreviousFiles) {
                    if (shouldSkipFile(f.path, f.content)) continue;
                    for (const [i, chunk] of chunkText(f.content).entries()) {
                        await storeVector({
                            id: `${createNamespace(owner, repoName)}-${f.path}-${i}-${Date.now()}`,
                            data: chunk,
                            metadata: { filePath: f.path },
                            namespace: createNamespace(owner, repoName)
                        });
                    }
                }

                // Update the task status in tasks.json
                try {
                    // Update task in in-memory array
                    const taskIndex = currentTasks.findIndex(t => t.id.toString() === task.id.toString());
                    if (taskIndex !== -1) {
                        currentTasks[taskIndex] = {
                            ...currentTasks[taskIndex],
                            status: 'completed'
                        };
                    }



                    if (setState) {
                        setState({
                            tasks: currentTasks,
                            repoName,
                            owner,
                        });
                    }


                    // Use the agent's generated commit message for the task status update
                    const taskStatusCommitMsg = commitMsg || `chore(tasks): mark task ${task.title} status as completed`;


                    if (currentTasks) {
                        await commitFilesToBranch(owner, repoName, "main", [{ path: "tasks.json", content: JSON.stringify(currentTasks) }], taskStatusCommitMsg, process.env.GITHUB_TOKEN || "");
                        console.log(`  Committed task status update with message: ${taskStatusCommitMsg}`);
                    }
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
    return { completed, failed, updatedTasks: currentTasks };
}

// --- Step 1: Process CORE Group ---
const processCoreStep = createStep({
    id: "process-core",
    description: "Processes CORE group tasks (setup, config, utilities)",
    inputSchema: SyncOutputSchema,
    outputSchema: GroupResultSchema,
    stateSchema: z.object({
        tasks: z.array(TaskSchema),
        repoName: z.string(),
        owner: z.string(),
    }),
    execute: async ({ inputData, state, setState }) => {
        const { tasks, repoName, owner } = state;
        const result = await processGroup("core", inputData.core, tasks, repoName, owner, setState);

        // Update the state with the modified tasks if they were updated
        if (result.updatedTasks) {
            setState({
                tasks: result.updatedTasks,
                repoName,
                owner,
            });
        }

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
    execute: async ({ inputData, state, setState }) => {
        const { tasks, repoName, owner } = state;

        const result = await processGroup("ui", inputData.syncData.ui, tasks, repoName, owner, setState);

        // Update the state with the modified tasks if they were updated
        if (result.updatedTasks) {
            setState({
                tasks: result.updatedTasks,
                repoName,
                owner,
            });
        }

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
    execute: async ({ inputData, state, setState }) => {
        const { tasks, repoName, owner } = state;

        const result = await processGroup("functionality", inputData.syncData.functionality, tasks, repoName, owner, setState);

        // Update the state with the modified tasks if they were updated
        if (result.updatedTasks) {
            setState({
                tasks: result.updatedTasks,
                repoName,
                owner,
            });
        }

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
    .then(processUiStep)         // Phase 2: UI components
    .then(processFunctionalityStep) // Phase 3: Business logic
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
