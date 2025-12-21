import { generateCode } from "@/lib/v0-sdk";
import { createRepository, repositoryExists, commitFilesToBranch } from "../../lib/git";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

// Schemas
const subTasksSchema = z.array(z.object({
    id: z.number(),
    title: z.string(),
    description: z.string(),
    dependencies: z.array(z.number()).optional(),
    group: z.string().optional()
}));

// Common validation functions
const validateGitHubToken = (): string => {
    const token = process.env.GITHUB_TOKEN;
    if (!token?.trim()) {
        throw new Error("GitHub token is required. Please set GITHUB_TOKEN environment variable.");
    }
    return token;
};

const validateRepositoryName = (RepositoryName: string): { owner: string; repoName: string } => {
    if (!RepositoryName?.trim()) {
        throw new Error("Repository name is required and cannot be empty");
    }
    if (!RepositoryName.includes("/") || RepositoryName.split("/").length !== 2) {
        throw new Error("Repository name must be in format 'owner/repository'");
    }

    const [owner, repoName] = RepositoryName.split("/");
    if (!owner?.trim() || !repoName?.trim()) {
        throw new Error("Invalid repository format: owner and repository name cannot be empty");
    }

    return { owner: owner.trim(), repoName: repoName.trim() };
};

const checkRepoExists = createStep({
    id: "check-repo-exists",
    description: "Checks if the repository already exists",
    inputSchema: z.object({
        projectName: z.string(),
        RepositoryName: z.string(),
        description: z.string(),
        initialPrompt: z.string(),
    }),
    outputSchema: z.object({
        IsRepoAlreadyExists: z.boolean(),
        projectName: z.string(),
        RepositoryName: z.string(),
        description: z.string(),
        initialPrompt: z.string(),
    }),
    stateSchema: z.object({
        repoName: z.string(),
        owner: z.string(),
        repositoryUrl: z.string(),
    }),
    execute: async ({ inputData }) => {
        try {
            // Validate input parameters
            if (!inputData.projectName?.trim()) {
                throw new Error("Project name is required and cannot be empty");
            }
            if (!inputData.initialPrompt?.trim()) {
                throw new Error("Initial prompt is required and cannot be empty");
            }

            const { projectName, RepositoryName, description, initialPrompt } = inputData;

            // Validate repository name and extract owner/repo
            const { owner, repoName } = validateRepositoryName(RepositoryName);

            // Validate GitHub token
            const token = validateGitHubToken();

            const exists = await repositoryExists(owner, repoName, token);

            if (exists) {
                throw new Error(`Repository "${owner}/${repoName}" already exists. Initialization aborted.`);
            }

            return {
                IsRepoAlreadyExists: exists,
                projectName,
                RepositoryName,
                description,
                initialPrompt
            };
        } catch (error) {
            if (error instanceof Error) {
                console.error(`Error in checkRepoExists step: ${error.message}`, error);
                throw new Error(`Repository check failed: ${error.message}`);
            }
            throw new Error("An unexpected error occurred while checking repository existence");
        }
    },
});

// Step 2: Initialize Repository
const initializeRepository = createStep({
    id: "initialize-repository",
    description: "Creates a new repository with initial project structure",
    inputSchema: z.object({
        IsRepoAlreadyExists: z.boolean(),
        projectName: z.string(),
        RepositoryName: z.string(),
        description: z.string(),
        initialPrompt: z.string(),
    }),
    outputSchema: z.object({
        initialPrompt: z.string(),
    }),
    stateSchema: z.object({
        repoName: z.string(),
        owner: z.string(),
        repositoryUrl: z.string(),
    }),
    execute: async ({ inputData, setState }) => {
        try {
            // Validate input parameters
            if (typeof inputData.IsRepoAlreadyExists !== "boolean") {
                throw new Error("IsRepoAlreadyExists must be a boolean value");
            }

            const { IsRepoAlreadyExists, RepositoryName, description } = inputData;

            if (IsRepoAlreadyExists) {
                throw new Error("Repository already exists (safety check failed)");
            }

            const { owner, repoName } = validateRepositoryName(RepositoryName);
            const token = validateGitHubToken();

            const newRepo = await createRepository(repoName, false, description || "", token);

            if (!newRepo) {
                throw new Error("Failed to create repository: No response from GitHub API");
            }

            if (!newRepo.owner || !newRepo.htmlUrl) {
                throw new Error("Invalid repository response: missing required fields");
            }

            const repositoryUrl = newRepo.htmlUrl;
            setState({ owner, repoName, repositoryUrl });

            return {
                initialPrompt: inputData.initialPrompt,
            };
        } catch (error) {
            if (error instanceof Error) {
                console.error(`Error in initializeRepository step: ${error.message}`, error);
                throw new Error(`Repository initialization failed: ${error.message}`);
            }
            throw new Error("An unexpected error occurred while initializing the repository");
        }
    },
});

// Step 3: Analyze Prompt & Generate Tasks Plan (JSON)
// const analysePrompt = createStep({
//     id: "analyse-prompt",
//     inputSchema: z.object({
//         initialPrompt: z.string(),
//         repositoryUrl: z.string(),
//         owner: z.string(),
//         repoName: z.string()
//     }),
//     outputSchema: z.object({
//         subtasks: subTasksSchema,
//     }),
//     stateSchema: z.object({
//         repoName: z.string(),
//         owner: z.string(),
//         repositoryUrl: z.string(),
//     }),
//     execute: async ({ inputData, mastra, setState }) => {
//         try {
//             const { owner, repoName, repositoryUrl } = inputData;

//             const agent = mastra.getAgent("nextjsCoderAgent");
//             if (!agent) throw new Error("Agent 'nextjsCoderAgent' not found");

//             const response = await agent.generate(inputData.initialPrompt, {
//                 instructions: `You are a Next.js project planning specialist. Your task is to analyze the project prompt and break it down into execution groups (tracks) for parallel development.

// IMPORTANT STRATEGY:
// 1. **Group ID "core"**: Project Setup, Configuration, Shared Utilities. (Must run first).
// 2. **Group ID "ui"**: UI Components, Styling, Themes, Layouts. (Runs in parallel with Functionality).
// 3. **Group ID "functionality"**: Core Business Logic, API Routes, State Management, Data Fetching. (Runs in parallel with UI).

// Response JSON Structure:
// {
//   "groups": [
//     {
//       "id": "core",
//       "title": "Project Setup",
//       "tasks": [...]
//     },
//     {
//        "id": "ui",
//        "title": "UI & Components",
//        ...
//     },
//     {
//        "id": "functionality",
//        "title": "Core Functionality",
//        ...
//     }
//   ]
// }

// Use EXACTLY these id strings: "core", "ui", "functionality".

// Ensure tasks within a group are sequential dependencies.
// Total tasks should cover the whole project.`,
//                 structuredOutput: {
//                     schema: z.object({
//                         groups: z.array(z.object({
//                             id: z.enum(["core", "ui", "functionality"]),
//                             title: z.string(),
//                             tasks: z.array(z.object({
//                                 id: z.number(),
//                                 title: z.string(),
//                                 description: z.string(),
//                                 dependencies: z.array(z.number()).optional(),
//                             }))
//                         }))
//                     }),
//                     errorStrategy: 'strict'
//                 }
//             });

//             if (!response.object) throw new Error("Failed to get structured response from agent");

//             const { groups } = response.object;
//             const allTasks = groups.flatMap(g => g.tasks.map(t => ({ ...t, group: g.id, status: "pending" })));

//             setState({ owner, repoName, repositoryUrl });

//             return { subtasks: allTasks };
//         } catch (error) {
//             throw new Error(`Failed to analyze prompt: ${error instanceof Error ? error.message : "Unknown error"}`);
//         }
//     },
// });

const generateImplementationPlan = createStep({
    id: "generate-implementation-plan",
    inputSchema: z.object({
        initialPrompt: z.string(),
    }),
    outputSchema: z.object({
        implementationPlan: z.string(),
    }),
    stateSchema: z.object({
        repoName: z.string(),
        owner: z.string(),
        repositoryUrl: z.string(),
    }),
    execute: async ({ inputData, mastra }) => {
        const { initialPrompt } = inputData;

        if (!initialPrompt.trim()) throw new Error("Initial prompt is required");

        try {
            const agent = mastra.getAgent("planCreationAgent");
            if (!agent) throw new Error("Agent 'planCreationAgent' not found");

            const response = await agent.generate(initialPrompt, {
                instructions: "Follow your system prompt instructions to create a comprehensive implementation plan."
            });

            // Prepend additional immediate execution directive to ensure v0 understands
            const immediateExecutionDirective = "\n\n*** CRITICAL v0 INSTRUCTION: IMMEDIATELY IMPLEMENT ALL PHASES WITHOUT ASKING ANY QUESTIONS OR SEEKING CLARIFICATION. START BUILDING THE COMPLETE PROJECT RIGHT NOW. ***\n\n";

            return { implementationPlan: immediateExecutionDirective + response.text };
        } catch (error) {
            throw new Error(`Failed to generate implementation plan: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    },
});

const initializeProject = createStep({
    id: "initialize-project",
    inputSchema: z.object({
        implementationPlan: z.string(),
    }),
    outputSchema: z.object({
        status: z.string(),
        message: z.string(),
        subtasks: subTasksSchema,
        chatId: z.string().optional(),
        projectUrl: z.string().optional()
    }),
    stateSchema: z.object({
        repoName: z.string(),
        owner: z.string(),
        repositoryUrl: z.string(),
    }),
    execute: async ({ inputData }) => {
        try {
            // Validate input parameters
            if (!inputData.implementationPlan?.trim()) {
                throw new Error("Implementation plan is required and cannot be empty");
            }

            const { implementationPlan } = inputData;

            console.log("======================================")
            console.log("Initializing project with v0 SDK...");
            console.log("======================================")

            // Use the generateCode function from v0-sdk
            const v0Response = await generateCode(implementationPlan);

            if (!v0Response) {
                throw new Error("Failed to generate code with v0 SDK");
            }

            const chatData = v0Response as any;
            const chatId = chatData.id;
            const projectUrl = chatData.webUrl || `https://v0.app/chat/${chatId}`;

            console.log("======================================")
            console.log("v0 Response:")
            console.dir(v0Response, { depth: null })
            console.log("v0 Response:", {
                chatId,
                projectUrl,
                title: chatData.title,
            });

            console.log("======================================")
            console.log("v0 Response files:")
            console.dir(chatData.files, { depth: null })
            console.log("======================================")

            // Generate a subtasks structure based on the implementation plan
            const subtasks = [
                {
                    id: 1,
                    title: "Project Setup",
                    description: "Initialize Next.js project with TypeScript and required dependencies",
                    dependencies: [],
                    group: "core"
                },
                {
                    id: 2,
                    title: "Core Components",
                    description: "Build essential UI components and layout structure",
                    dependencies: [1],
                    group: "ui"
                },
                {
                    id: 3,
                    title: "Functionality Implementation",
                    description: "Implement core business logic and features",
                    dependencies: [1],
                    group: "functionality"
                }
            ];

            return {
                status: "initialized",
                message: "Project initialization completed successfully with v0",
                subtasks: subtasks,
                chatId: chatId,
                projectUrl: projectUrl
            };
        } catch (error) {
            if (error instanceof Error) {
                console.error(`Error in initializeProject step: ${error.message}`, error);
                throw new Error(`Project initialization failed: ${error.message}`);
            }
            throw new Error("An unexpected error occurred while initializing the project");
        }
    }
})

// Step 4: Commit Tasks.json (Single Source)
const commitTasksFile = createStep({
    id: "commit-tasks-file",
    inputSchema: z.object({
        status: z.string(),
        message: z.string(),
        subtasks: subTasksSchema,
        chatId: z.string().optional(),
        projectUrl: z.string().optional()
    }),
    outputSchema: z.object({
        status: z.string(),
        commitSha: z.string(),
        fileUrl: z.string(),
        v0ProjectUrl: z.string().optional()
    }),
    stateSchema: z.object({
        repoName: z.string(),
        owner: z.string(),
        repositoryUrl: z.string(),
    }),
    execute: async ({ inputData, state }) => {
        try {
            // Validate input parameters
            if (!inputData.subtasks || !Array.isArray(inputData.subtasks)) {
                throw new Error("Subtasks must be provided as an array");
            }
            if (inputData.subtasks.length === 0) {
                throw new Error("At least one subtask must be provided");
            }

            const { subtasks } = inputData;
            const { owner, repoName } = state;

            // Validate state
            if (!owner?.trim()) {
                throw new Error("State missing owner or owner is empty");
            }
            if (!repoName?.trim()) {
                throw new Error("State missing repoName or repoName is empty");
            }

            // Validate subtasks structure
            for (const task of subtasks) {
                if (!task.id || typeof task.id !== "number") {
                    throw new Error("Each subtask must have a valid numeric id");
                }
                if (!task.title?.trim()) {
                    throw new Error("Each subtask must have a non-empty title");
                }
                if (!task.description?.trim()) {
                    throw new Error("Each subtask must have a non-empty description");
                }
            }

            // Validate GitHub token
            const token = validateGitHubToken();

            const tasksJson = JSON.stringify(subtasks, null, 2);

            const commitSHA = await commitFilesToBranch(
                owner,
                repoName,
                "main",
                [{ path: "tasks.json", content: tasksJson }],
                "Initialize project with tasks.json plan (v0 integration)",
                token
            );

            if (!commitSHA) {
                throw new Error("Failed to commit tasks file: No commit SHA returned");
            }

            return {
                status: "success",
                commitSha: commitSHA,
                fileUrl: `https://github.com/${owner}/${repoName}/blob/main/tasks.json`,
                v0ProjectUrl: inputData.projectUrl
            };
        } catch (error) {
            if (error instanceof Error) {
                console.error(`Error in commitTasksFile step: ${error.message}`, error);
                throw new Error(`Tasks file commit failed: ${error.message}`);
            }
            throw new Error("An unexpected error occurred while committing the tasks file");
        }
    }
});

// Workflow
export const initializeProjectWorkflow = createWorkflow({
    id: "initialize-project-workflow",
    inputSchema: z.object({
        projectName: z.string(),
        RepositoryName: z.string(),
        description: z.string(),
        initialPrompt: z.string(),
    }),
    outputSchema: z.object({
        status: z.string(),
        fileUrl: z.string(),
        v0ProjectUrl: z.string().optional()
    }),
    stateSchema: z.object({
        repoName: z.string(),
        owner: z.string(),
        repositoryUrl: z.string(),
    }),
    steps: [checkRepoExists, initializeRepository, generateImplementationPlan, initializeProject, commitTasksFile],
})
    .then(checkRepoExists)
    .then(initializeRepository)
    .then(generateImplementationPlan)
    .then(initializeProject)
    // .then(commitTasksFile)
    .commit();
