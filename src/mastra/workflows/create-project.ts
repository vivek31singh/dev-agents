import { storeVector } from "@/lib/vector";
import { createRepository, repositoryExists, fetchAllRepositoryFiles, pushFilesAsCommit } from "../../lib/git";
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
    stateSchema: z.object({
        repoName: z.string(),
        owner: z.string(),
        repositoryUrl: z.string(),
        tasksMd: z.string(),
    }),
    execute: async ({ inputData, setState }) => {
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
            setState({
                repoName,
                owner,
                repositoryUrl: `https://github.com/${owner}/${repoName}
                `,
                tasksMd: ""
            });
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
    execute: async ({ inputData, setState }) => {
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

            const tasksMd = repositoryFiles.find(file => file.path.toLowerCase() === "tasks.md");
            if (!tasksMd) {
                throw new Error("tasks.md file not found in the repository");
            }

            setState({
                tasksMd: tasksMd.content
            });

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

const subTasksSchema = z.array(z.object({
    id: z.number(),
    title: z.string(),
    description: z.string(),
    dependencies: z.array(z.number()).optional(),
}));

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
    outputSchema: z.object({
        action: z.string(),
        subtasks: subTasksSchema,
        tasksMd: z.string(),
    }),
    execute: async ({ inputData, mastra, setState }) => {

        if (inputData.action !== "create") throw new Error("analysePrompt step only supports 'create' action");

        if (!inputData.initialPrompt.trim() || inputData.initialPrompt.length === 0) throw new Error("Prompt is required");

        try {
            const agent = mastra.getAgent("nextjsCoderAgent");
            const response = await agent.generate(inputData.initialPrompt, {
                instructions:
                    `You are a Next.js project planning specialist. Your task is to analyze the given project prompt and break it down into a sequential list of executable subtasks that will guide the step-by-step development of the project.

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

            const subtasks = response.object;

            // Generate Markdown
            const tasksMd = "# Project Tasks\n\n" + subtasks.map(task =>
                `## [Task ${task.id}] ${task.title}
Status: Pending
Dependencies: ${task.dependencies?.join(', ') || 'None'}

${task.description}
`
            ).join("\n");

            setState({ tasksMd });

            return { action: "create", subtasks, tasksMd };

        } catch (err) {
            throw new Error(`Failed to analyse prompt: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    },
});

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

const SKIP_PATTERNS = [
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    '.lock',
    '.svg',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.mp4',
    '.mp3',
    '.webm',
    '.pdf',
    '.zip',
    '.tar',
    '.gz',
    'node_modules/',
    '.next/',
    'dist/',
    '.git/',
];

const MAX_FILE_SIZE = 50000;

function shouldSkipFile(filePath: string, content: string): boolean {
    if (SKIP_PATTERNS.some(pattern => filePath.toLowerCase().includes(pattern.toLowerCase()))) {
        return true;
    }
    if (content.length > MAX_FILE_SIZE) {
        return true;
    }
    const nonPrintable = content.slice(0, 1000).split('').filter(c => {
        const code = c.charCodeAt(0);
        return code < 32 && code !== 9 && code !== 10 && code !== 13;
    }).length;
    if (nonPrintable > 10) {
        return true;
    }
    return false;
}

const createEmbeddings = createStep({
    id: "create-embeddings",
    description: "Create embeddings for the project",
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
        action: z.string(),
        skippedFiles: z.number(),
        totalChunks: z.number(),
    }),
    stateSchema: z.object({
        repoName: z.string(),
        owner: z.string(),
        repositoryUrl: z.string(),
        tasksMd: z.string(),
    }),
    execute: async ({ inputData, state }) => {
        const { action } = inputData;

        if (action !== "fetch") {
            throw new Error("Invalid action");
        }

        let skippedFiles = 0;
        let totalChunks = 0;

        for (const file of inputData.repositoryFiles) {
            // Skip files that shouldn't be embedded
            if (shouldSkipFile(file.path, file.content)) {
                skippedFiles++;
                continue;
            }

            // Chunk the file content to avoid sparse vector size limits
            const chunks = chunkText(file.content, 3000);
            console.log(`[embeddings] Processing ${file.path}: ${chunks.length} chunk(s)`);

            for (let i = 0; i < chunks.length; i++) {
                const chunkId = chunks.length > 1
                    ? `${state.repoName}-${file.path}-chunk-${i}`
                    : `${state.repoName}-${file.path}`;

                await storeVector({
                    id: chunkId,
                    data: chunks[i],
                    metadata: {
                        fileName: file.path.split("/").pop(),
                        filePath: file.path,
                        chunkIndex: i,
                        totalChunks: chunks.length,
                    },
                });
                totalChunks++;
            }
        }

        console.log(`[embeddings] Completed: ${totalChunks} chunks from ${inputData.repositoryFiles.length - skippedFiles} files (${skippedFiles} skipped)`);
        return { action: action, skippedFiles, totalChunks };
    },
});

const commitTasksFile = createStep({
    id: "commit-tasks-file",
    description: "Commits tasks.md file to the repository",
    inputSchema: z.object({
        action: z.string(),
        subtasks: subTasksSchema,
        tasksMd: z.string(),
    }),
    outputSchema: z.object({
        action: z.string(),
        subtasks: subTasksSchema,
        tasksMd: z.string(),
    }),
    stateSchema: z.object({
        repoName: z.string(),
        owner: z.string(),
        repositoryUrl: z.string(),
        tasksMd: z.string(),
    }),
    execute: async ({ inputData, state }) => {
        const { tasksMd } = inputData;
        const { owner, repoName } = state;

        if (!owner || !repoName) throw new Error("Owner or repoName missing from state");

        const token = process.env.GITHUB_TOKEN || "";

        await pushFilesAsCommit({
            owner,
            repo: repoName,
            baseBranch: "main",
            newBranch: "main",
            files: [{ path: "tasks.md", content: tasksMd }],
            commitMessage: "Add project tasks plan",
            token,
        });

        return { action: "create", subtasks: inputData.subtasks, tasksMd };
    }
});

const projectPlanningWorkflow = createWorkflow({
    id: "project-planning-workflow",
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
        action: z.string(),
        subtasks: subTasksSchema,
        tasksMd: z.string(),
    }),
    steps: [analysePrompt, commitTasksFile],
}).then(analysePrompt).then(commitTasksFile).commit();

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
    stateSchema: z.object({
        repoName: z.string(),
        owner: z.string(),
        repositoryUrl: z.string(),
        tasksMd: z.string(),
    }),
    steps: [
        checkRepoExists,
        fetchRepoContent,
        initializeRepository,
        analysePrompt,
        createEmbeddings
    ],
}).then(checkRepoExists)
    .branch([
        [async ({ inputData }) => inputData.IsRepoAlreadyExists, fetchRepoContent],
        [async ({ inputData }) => !inputData.IsRepoAlreadyExists, initializeRepository],
    ])
    .map(async ({ inputData }) => {
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
    })
    .branch([
        [async ({ inputData }) => inputData.action === "fetch", createEmbeddings],
        [async ({ inputData }) => inputData.action === "create", analysePrompt],
    ])
    .commit();