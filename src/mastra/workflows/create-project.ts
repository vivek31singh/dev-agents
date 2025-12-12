import { createRepository, repositoryExists, fetchAllRepositoryFiles } from "../../lib/git";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const checkRepoExists = createStep({
    id: "check-repo-exists",
    description: "Checks if the repository already exists",
    inputSchema: z.object({
        projectName: z.string().describe("Name of the project"),
        RepositoryName: z.string().describe("Name of the repository"),
        description: z.string().describe("Description of the project"),
        initialPrompt: z.string().describe("Initial prompt for the project"),
    }),
    outputSchema: z.object({
        IsRepoAlreadyExists: z.boolean().describe("Does the repository already exists"),
        projectName: z.string().describe("Name of the project"),
        RepositoryName: z.string().describe("Name of the repository"),
        description: z.string().describe("Description of the project"),
        initialPrompt: z.string().describe("Initial prompt for the project"),
    }),
    execute: async ({ inputData }) => {
        // Validate inputData exists
        if (!inputData) {
            throw new Error("Input data is required");
        }

        const { projectName = "", RepositoryName = "", description = "", initialPrompt = "" } = inputData;

        if (!projectName.trim() || projectName.length === 0) throw new Error("Project name is required");
        if (!RepositoryName.trim() || RepositoryName.length === 0) throw new Error("Repository name is required");
        if (!description.trim() || description.length === 0) throw new Error("Description is required");
        if (!initialPrompt.trim() || initialPrompt.length === 0) throw new Error("Initial prompt is required");

        const owner = RepositoryName.split("/")[0] || "";
        const repoName = RepositoryName.split("/")[1] || "";
        if (owner.length === 0 || repoName.length === 0) throw new Error("Repository name is invalid");

        const token = process.env.GITHUB_TOKEN || "";
        if (token.length === 0) throw new Error("GitHub token is required");
        try {

            const IsRepoAlreadyExists = await repositoryExists(owner, repoName, token);

            return {
                IsRepoAlreadyExists,
                projectName,
                RepositoryName,
                description,
                initialPrompt
            };
        } catch (error) {
            console.error("Error checking repository existence:", error);
            throw new Error(`Failed to check repository existence: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    },
});

const fetchRepoContent = createStep({
    id: "fetch-repo-content",
    description: "Fetches all files and their content from an existing repository",
    inputSchema: z.object({
        IsRepoAlreadyExists: z.boolean().describe("Does the repository already exists"),
        projectName: z.string().describe("Name of the project"),
        RepositoryName: z.string().describe("Name of the repository"),
        description: z.string().describe("Description of the project"),
        initialPrompt: z.string().describe("Initial prompt for the project"),
    }),
    outputSchema: z.object({
        repositoryFiles: z.array(z.object({
            path: z.string().describe("File path in the repository"),
            content: z.string().describe("Content of the file")
        })).describe("Array of all files with their paths and content"),
        fileCount: z.number().describe("Total number of files fetched")
    }),
    execute: async ({ inputData }) => {
        // Validate inputData exists
        if (!inputData) {
            throw new Error("Input data is required");
        }

        const { IsRepoAlreadyExists, RepositoryName } = inputData;

        if (!IsRepoAlreadyExists) {
            throw new Error("Repository does not exist, cannot fetch content");
        }

        if (!RepositoryName || !RepositoryName.trim() || RepositoryName.length === 0) {
            throw new Error("Repository name is required");
        }

        const owner = RepositoryName.split("/")[0] || "";
        const repoName = RepositoryName.split("/")[1] || "";

        if (owner.length === 0 || repoName.length === 0) {
            throw new Error("Repository name is invalid");
        }

        const token = process.env.GITHUB_TOKEN || "";
        if (token.length === 0) {
            throw new Error("GitHub token is required");
        }

        try {
            console.log(`Fetching repository content from ${owner}/${repoName}`);

            // Fetch all files from repository
            const repositoryFiles = await fetchAllRepositoryFiles(owner, repoName, token, 'main');

            console.log(`Successfully fetched ${repositoryFiles.length} files from ${owner}/${repoName}`);

            return {
                repositoryFiles,
                fileCount: repositoryFiles.length
            };
        } catch (error) {
            console.error("Error fetching repository content:", error);
            throw new Error(`Failed to fetch repository content: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    },
});

const initializeRepository = createStep({
    id: "initialize-repository",
    description: "Creates a new repository with initial project structure",
    inputSchema: z.object({
        IsRepoAlreadyExists: z.boolean().describe("Does the repository already exists"),
        projectName: z.string().describe("Name of the project"),
        RepositoryName: z.string().describe("Name of the repository"),
        description: z.string().describe("Description of the project"),
        initialPrompt: z.string().describe("Initial prompt for the project"),
    }),
    outputSchema: z.object({
        initialPrompt: z.string().describe("Initial prompt for the project"),
        repositoryUrl: z.string().describe("URL of the created repository"),
        owner: z.string().describe("Owner of the repository"),
        repoName: z.string().describe("Name of the created repository")
    }),
    execute: async ({ inputData }) => {
        const { IsRepoAlreadyExists, RepositoryName, description } = inputData;

        if (IsRepoAlreadyExists) {
            throw new Error("Repository already exists, cannot initialize");
        }

        if (!RepositoryName.trim() || RepositoryName.length === 0) {
            throw new Error("Repository name is required");
        }

        const owner = RepositoryName.split("/")[0] || "";
        const repoName = RepositoryName.split("/")[1] || "";

        if (owner.length === 0 || repoName.length === 0) {
            throw new Error("Repository name is invalid");
        }

        const token = process.env.GITHUB_TOKEN || "";
        if (token.length === 0) {
            throw new Error("GitHub token is required");
        }

        try {
            // Create the repository
            const newRepo = await createRepository(
                repoName,
                false, // private repository
                description,
                token,
            );

            console.log(`Successfully created repository: ${newRepo.htmlUrl}`);

            return {
                initialPrompt: inputData.initialPrompt,
                repositoryUrl: newRepo.htmlUrl,
                owner: newRepo.owner,
                repoName: newRepo.name
            };
        } catch (error) {
            console.error("Error creating repository:", error);
            throw new Error(`Failed to create repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    },
});

const synthesisResults = createStep({
    id: "synthesis-results",
    inputSchema: z.object({
        "fetch-repo-content": z.object({
            repositoryFiles: z.array(z.object({
                path: z.string().describe("File path in the repository"),
                content: z.string().describe("Content of the file")
            })).describe("Array of all files with their paths and content"),
            fileCount: z.number().describe("Total number of files fetched")
        }),
        "initialize-repository": z.object({
            initialPrompt: z.string().describe("Initial prompt for the project"),
            repositoryUrl: z.string().describe("URL of the created repository"),
            owner: z.string().describe("Owner of the repository"),
            repoName: z.string().describe("Name of the created repository")
        })
    }),
    outputSchema: z.union([
        z.object({
            action: z.literal("fetch"),
            repositoryFiles: z.array(z.object({
                path: z.string(),
                content: z.string()
            })),
            fileCount: z.number()
        }),
        z.object({
            action: z.literal("create"),
            initialPrompt: z.string().describe("Initial prompt for the project"),
            repositoryUrl: z.string(),
            owner: z.string(),
            repoName: z.string()
        })
    ]),
    execute: async ({ inputData }) => {
        const { "fetch-repo-content": fetchResult, "initialize-repository": initResult } = inputData;

        if (fetchResult) {
            return {
                action: "fetch" as const,
                repositoryFiles: fetchResult.repositoryFiles,
                fileCount: fetchResult.fileCount
            };
        } else if (initResult) {
            return {
                action: "create" as const,
                initialPrompt: initResult.initialPrompt,
                repositoryUrl: initResult.repositoryUrl,
                owner: initResult.owner,
                repoName: initResult.repoName
            };
        }

        throw new Error("No valid result found");
    },
});

const analysePrompt = createStep({
    id: "analyse-prompt",
    inputSchema: z.union([
        z.object({
            action: z.literal("fetch"),
            repositoryFiles: z.array(z.object({
                path: z.string(),
                content: z.string()
            })),
            fileCount: z.number()
        }),
        z.object({
            action: z.literal("create"),
            initialPrompt: z.string().describe("Initial prompt for the project"),
            repositoryUrl: z.string(),
            owner: z.string(),
            repoName: z.string()
        })
    ]),
    outputSchema: z.array(z.object({
        id: z.number(),
        title: z.string(),
        description: z.string(),
        dependencies: z.array(z.number()).optional(),
    })),
    stateSchema: z.object({
        name: z.string(),
        subtasks: z.array(z.object({
            id: z.number(),
            title: z.string(),
            description: z.string(),
            dependencies: z.array(z.number()).optional(),
        })),
    }),
    execute: async ({ inputData, mastra }) => {
        // Type guard to check if we have a "create" action with initialPrompt
        if (inputData.action === "create") {
            if (!inputData.initialPrompt.trim() || inputData.initialPrompt.length === 0) throw new Error("Prompt is required");
        } else {
            throw new Error("analysePrompt step only supports 'create' action");
        }

        try {
            const agent = mastra.getAgent("nextjsCoderAgent");
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

Follow this systematic approach when breaking down the project:

1. PROJECT SETUP PHASE
   - Initialize Next.js project with TypeScript
   - Configure essential dependencies (Tailwind, shadcn/ui, etc.)
   - Set up project structure and folders

2. FOUNDATION LAYOUT PHASE
   - Create root layout and basic page structure
   - Set up navigation components
   - Establish design system and styling approach

3. CORE PAGES/COMPONENTS PHASE
   - Identify and create main pages needed
   - Break down UI into reusable components
   - Implement basic component structure

4. FUNCTIONALITY IMPLEMENTATION PHASE
   - Add interactivity and state management using React hooks
   - Implement business logic with TypeScript
   - Use HTML5 Canvas API for any graphics/rendering needs
   - Use CSS animations and transitions for visual effects
   - Leverage browser APIs like KeyboardEvent, MouseEvent for interactions

5. REFINEMENT PHASE
   - Add animations using CSS or Framer Motion (if needed)
   - Optimize performance using Next.js features
   - Ensure responsive design with Tailwind CSS

For games or interactive applications:
- Use React hooks for game state management
- Implement game loop with requestAnimationFrame
- Use HTML5 Canvas for rendering
- Handle input with browser event listeners
- Create physics with simple JavaScript math

For each subtask:
- Provide a clear, actionable title
- Include a detailed description of what needs to be done
- Specify dependencies (which subtasks must be completed first)
- Ensure tasks are ordered logically from setup to final polish
- Keep all implementation within Next.js/React/TypeScript/standard web APIs

The subtasks should be granular enough to be executed independently but comprehensive enough to cover the entire project development.`,
                structuredOutput: {
                    schema: z.array(z.object({
                        id: z.number(),
                        title: z.string(),
                        description: z.string(),
                        dependencies: z.array(z.number()).optional(),
                    })),
                    errorStrategy: 'strict'
                },
            });

            if (!response.object) {
                throw new Error("Failed to get structured response from agent");
            }

            return response.object;

        } catch (err) {
            throw new Error(`Failed to analyse prompt: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    },
});

const createEmbeddings = createStep({
    id: "create-embeddings",
    inputSchema: z.union([
        z.object({
            action: z.literal("fetch"),
            repositoryFiles: z.array(z.object({
                path: z.string(),
                content: z.string()
            })),
            fileCount: z.number()
        }),
        z.object({
            action: z.literal("create"),
            initialPrompt: z.string().describe("Initial prompt for the project"),
            repositoryUrl: z.string(),
            owner: z.string(),
            repoName: z.string()
        })
    ]),
    outputSchema: z.object({
        embeddings: z.array(z.number()),
    }),
    execute: async ({ inputData }) => {
        const { action } = inputData;

        // Type guard to handle different actions
        if (action === "fetch") {
            // Handle fetch case with repositoryFiles
            // const embeddings = await createEmbeddingsFromFiles(inputData.repositoryFiles);
        } else {
            // Handle create case
            // const embeddings = await createEmbeddingsFromPrompt(inputData.initialPrompt);
        }

        return { embeddings: [] };
    },
});

export const createProjectWorkflow = createWorkflow({
    id: "create-project-workflow",
    inputSchema: z.object({
        projectName: z.string().describe("Name of the project"),
        RepositoryName: z.string().describe("Name of the repository"),
        description: z.string().describe("Description of the project"),
        initialPrompt: z.string().describe("Initial prompt for the project"),
    }),
    outputSchema: z.union([
        z.object({
            action: z.literal("fetch"),
            repositoryFiles: z.array(z.object({
                path: z.string(),
                content: z.string()
            })),
            fileCount: z.number()
        }),
        z.object({
            action: z.literal("create"),
            initialPrompt: z.string().describe("Initial prompt for the project"),
            repositoryUrl: z.string(),
            owner: z.string(),
            repoName: z.string()
        })
    ]),

    steps: [
        checkRepoExists,
        fetchRepoContent,
        initializeRepository,
        synthesisResults,
        analysePrompt,
        createEmbeddings
    ],
}).then(checkRepoExists)
    .branch([
        [async ({ inputData }) => inputData.IsRepoAlreadyExists, fetchRepoContent],
        [async ({ inputData }) => !inputData.IsRepoAlreadyExists, initializeRepository],
    ])
    .then(synthesisResults)
    .branch([
        [async ({ inputData }) => inputData.action === "fetch", createEmbeddings],
        [async ({ inputData }) => inputData.action === "create", analysePrompt],
    ])
    .commit();