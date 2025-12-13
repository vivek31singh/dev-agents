import { createRepository, repositoryExists, commitFilesToBranch } from "../../lib/git";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

// Schemas
const subTasksSchema = z.array(z.object({
    id: z.number(),
    title: z.string(),
    description: z.string(),
    dependencies: z.array(z.number()).optional(),
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
        tasksMd: z.string(),
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
                tasksMd: ""
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

            // User modification: removed owner arg
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
        tasksMd: z.string(),
    }),
    stateSchema: z.object({
        repoName: z.string(),
        owner: z.string(),
        repositoryUrl: z.string(),
        tasksMd: z.string(),
    }),
    execute: async ({ inputData, mastra, setState }) => {
        try {
            const { owner, repoName, repositoryUrl } = inputData;

            const agent = mastra.getAgent("nextjsCoderAgent");
            if (!agent) throw new Error("Agent 'nextjsCoderAgent' not found");

            const response = await agent.generate(inputData.initialPrompt, {
                instructions: `You are a Next.js project planning specialist. Your task is to analyze the given project prompt and break it down into a sequential list of executable subtasks that will guide the step-by-step development of the project.

IMPORTANT CONSTRAINTS:
- ALL implementation MUST stay within the Next.js ecosystem
- Use ONLY React, TypeScript, Next.js features, and standard web APIs
- NO external game engines, physics libraries, or heavy dependencies
- Use HTML5 Canvas API, CSS animations, and React hooks for any game-like functionality
- Leverage Next.js App Router, Server Components, and Client Components appropriately

IMPORTANT: You must respond with a JSON array matching this structure:
[
    {
      "id": 1,
      "title": "Set up Next.js project structure",
      "description": "Initialize a new Next.js project with TypeScript and configure the basic directory structure",
      "dependencies": []
    },
    {
      "id": 2,
      "title": "Configure Tailwind CSS and shadcn/ui",
      "description": "Install and configure Tailwind CSS along with shadcn/ui components for consistent styling",
      "dependencies": [1]
    }
  ]

Follow this systematic approach based on the type of project requested:

--- SCENARIO A: WEB APPS / DASHBOARDS / SAAS ---
1. SETUP & CONFIGURATION
   - Init Next.js + TypeScript
   - Setup Tailwind, shadcn/ui, ThemeProvider
   - Configure global states/contexts

2. LAYOUT & NAVIGATION
   - Create Root Layout (metadata, fonts)
   - Implement Sidebar/Navbar components
   - Define loading.tsx and error.tsx

3. CORE FEATURES & PAGES
   - Create main route pages
   - Build reusable data-display components (Tables, Cards)
   - Implement forms with validation (React Hook Form + Zod)

--- SCENARIO B: WEB GAMES (e.g., Mario, Platformers, Snake) ---
1. GAME ENGINE SETUP
   - Create a main Game Container component
   - setup 'useGameLoop' hook using requestAnimationFrame
   - Initialize Canvas refs and context

2. STATE MANAGEMENT & PHYSICS
   - Design the Game State (score, player position, entity lists)
   - Implement collision detection logic (AABB or similar)
   - Create InputHandler (keyboard/touch listeners)

3. RENDERING & ASSETS
   - Create Sprite rendering system (on Canvas)
   - Implement simple animations (frame-based)
   - Add rudimentary sound effects (Web Audio API)

--- SCENARIO C: UI TEMPLATES / LANDING PAGES ---
1. FOUNDATIONS
   - Define Color Palette and Typography via Tailwind config
   - Create a comprehensive Component Library (Buttons, Inputs, Cards)

2. SECTIONS & BLOCKS
   - Build Hero Section with animations
   - Build Feature Grid, Testimonials, Footer
   - Ensure complete Mobile Responsiveness

3. POLISH
   - Add Framer Motion for scroll reveals
   - Optimize images and fonts
   - Verify Accessibility (ARIA)

For each subtask:
- Provide a clear, actionable title
- Include a detailed description of what needs to be done
- Specify dependencies (which subtasks must be completed first)
- Ensure tasks are ordered logically
- Keep all implementation within Next.js/React/TypeScript/standard web APIs

The subtasks should be granular enough to be executed independently but comprehensive enough to cover the entire project development.`,
                structuredOutput: {
                    schema: subTasksSchema,
                    errorStrategy: 'strict'
                }
            });

            const subtasks = response.object || [];

            // Generate JSON tasks.md with "pending" status
            const tasksMd = "```json\n" + JSON.stringify(subtasks.map(task => ({
                id: task.id,
                title: task.title,
                description: task.description,
                dependencies: task.dependencies || [],
                status: "pending"
            })), null, 2) + "\n```";

            // Update State with ALL info to ensure persistence
            setState({
                tasksMd,
                owner,
                repoName,
                repositoryUrl
            });

            return { subtasks, tasksMd };
        } catch (error) {
            throw new Error(`Failed to analyze prompt: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    },
});

// Step 4: Commit Tasks.md
const commitTasksFile = createStep({
    id: "commit-tasks-file",
    inputSchema: z.object({
        subtasks: subTasksSchema,
        tasksMd: z.string(),
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
        tasksMd: z.string(),
    }),
    execute: async ({ inputData, state }) => {
        try {
            const { tasksMd } = inputData;
            const { owner, repoName } = state;

            if (!owner || !repoName) throw new Error("State missing owner or repoName. Ensure upstream steps propagate state correctly.");

            const token = process.env.GITHUB_TOKEN || "";
            const branch = "main";

            // Replaced repetitive logic with commitFilesToBranch utility
            const commitSHA = await commitFilesToBranch(
                owner,
                repoName,
                branch,
                [{ path: "tasks.md", content: tasksMd }],
                "Initialize project with tasks.md plan",
                token
            );

            return {
                status: "success",
                commitSha: commitSHA,
                fileUrl: `https://github.com/${owner}/${repoName}/blob/main/tasks.md`
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
