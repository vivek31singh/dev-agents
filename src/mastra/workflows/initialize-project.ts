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

// Step 1: Check if Repo Exists
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
    execute: async ({ inputData, setState }) => {
        try {
            const { projectName, RepositoryName, description, initialPrompt } = inputData;
            const owner = RepositoryName.split("/")[0];
            const repoName = RepositoryName.split("/")[1];
            const token = process.env.GITHUB_TOKEN || "";

            const exists = await repositoryExists(owner, repoName, token);

            if (exists) {
                throw new Error(`Repository "${owner}/${repoName}" already exists. Initialization aborted.`);
            }

            setState({
                repoName,
                owner,
                repositoryUrl: `https://github.com/${owner}/${repoName}`,
            });

            return {
                IsRepoAlreadyExists: exists,
                projectName,
                RepositoryName,
                description,
                initialPrompt
            };
        } catch (error) {
            throw error;
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
        repositoryUrl: z.string(),
        owner: z.string(),
        repoName: z.string()
    }),
    execute: async ({ inputData }) => {
        try {
            const { IsRepoAlreadyExists, RepositoryName, description } = inputData;

            if (IsRepoAlreadyExists) {
                throw new Error("Repository already exists (safety check failed)");
            }

            const repoName = RepositoryName.split("/")[1];
            const token = process.env.GITHUB_TOKEN || "";

            const newRepo = await createRepository(repoName, false, description, token);

            return {
                initialPrompt: inputData.initialPrompt,
                repositoryUrl: newRepo.htmlUrl,
                owner: newRepo.owner,
                repoName: newRepo.name
            };
        } catch (error) {
            throw new Error(`Failed to initialize repository: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    },
});

// Step 3: Analyze Prompt & Generate Tasks Plan (JSON)
const analysePrompt = createStep({
    id: "analyse-prompt",
    inputSchema: z.object({
        initialPrompt: z.string(),
        repositoryUrl: z.string(),
        owner: z.string(),
        repoName: z.string()
    }),
    outputSchema: z.object({
        subtasks: subTasksSchema,
    }),
    stateSchema: z.object({
        repoName: z.string(),
        owner: z.string(),
        repositoryUrl: z.string(),
    }),
    execute: async ({ inputData, mastra, setState }) => {
        try {
            const { owner, repoName, repositoryUrl } = inputData;

            const agent = mastra.getAgent("nextjsCoderAgent");
            if (!agent) throw new Error("Agent 'nextjsCoderAgent' not found");

            const response = await agent.generate(inputData.initialPrompt, {
                instructions: `You are a Next.js project planning specialist. Your task is to analyze the project prompt and break it down into execution groups (tracks) for parallel development.

IMPORTANT STRATEGY:
1. **Group ID "core"**: Project Setup, Configuration, Shared Utilities. (Must run first).
2. **Group ID "ui"**: UI Components, Styling, Themes, Layouts. (Runs in parallel with Functionality).
3. **Group ID "functionality"**: Core Business Logic, API Routes, State Management, Data Fetching. (Runs in parallel with UI).

Response JSON Structure:
{
  "groups": [
    {
      "id": "core",
      "title": "Project Setup",
      "tasks": [...]
    },
    {
       "id": "ui",
       "title": "UI & Components",
       ...
    },
    {
       "id": "functionality",
       "title": "Core Functionality",
       ...
    }
  ]
}

Use EXACTLY these id strings: "core", "ui", "functionality".

Ensure tasks within a group are sequential dependencies.
Total tasks should cover the whole project.`,
                structuredOutput: {
                    schema: z.object({
                        groups: z.array(z.object({
                            id: z.enum(["core", "ui", "functionality"]),
                            title: z.string(),
                            tasks: z.array(z.object({
                                id: z.number(),
                                title: z.string(),
                                description: z.string(),
                                dependencies: z.array(z.number()).optional(),
                            }))
                        }))
                    }),
                    errorStrategy: 'strict'
                }
            });

            if (!response.object) throw new Error("Failed to get structured response from agent");

            const { groups } = response.object;
            const allTasks = groups.flatMap(g => g.tasks.map(t => ({ ...t, group: g.id, status: "pending" })));

            setState({ owner, repoName, repositoryUrl });

            return { subtasks: allTasks };
        } catch (error) {
            throw new Error(`Failed to analyze prompt: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    },
});

// Step 4: Commit Tasks.json (Single Source)
const commitTasksFile = createStep({
    id: "commit-tasks-file",
    inputSchema: z.object({
        subtasks: subTasksSchema,
    }),
    outputSchema: z.object({
        status: z.string(),
        commitSha: z.string(),
        fileUrl: z.string()
    }),
    stateSchema: z.object({
        repoName: z.string(),
        owner: z.string(),
        repositoryUrl: z.string(),
    }),
    execute: async ({ inputData, state }) => {
        try {
            const { subtasks } = inputData;
            const { owner, repoName } = state;

            if (!owner || !repoName) throw new Error("State missing owner or repoName.");

            const token = process.env.GITHUB_TOKEN || "";
            const tasksJson = JSON.stringify(subtasks, null, 2);

            const commitSHA = await commitFilesToBranch(
                owner,
                repoName,
                "main",
                [{ path: "tasks.json", content: tasksJson }],
                "Initialize project with tasks.json plan (Parallel Groups)",
                token
            );

            return {
                status: "success",
                commitSha: commitSHA,
                fileUrl: `https://github.com/${owner}/${repoName}/blob/main/tasks.json`
            };
        } catch (error) {
            console.error(error);
            throw new Error(`Failed to commit tasks file: ${error instanceof Error ? error.message : "Unknown error"}`);
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
        fileUrl: z.string()
    }),
    steps: [checkRepoExists, initializeRepository, analysePrompt, commitTasksFile],
}).then(checkRepoExists).then(initializeRepository).then(analysePrompt).then(commitTasksFile).commit();
