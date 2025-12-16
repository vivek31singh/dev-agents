import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchVector } from '@/lib/vector';

// Schema for code context
const CodeContextSchema = z.object({
    relevantFiles: z.array(z.object({
        filePath: z.string(),
        content: z.string(),
        relevanceScore: z.number(),
    })),
    projectPatterns: z.object({
        hasTypeScript: z.boolean(),
        hasTailwind: z.boolean(),
        hasAppRouter: z.boolean(),
        componentNaming: z.string().optional(),
    }).optional(),
});

// Helper: Analyze project patterns from search results
function analyzeProjectPatterns(results: any[]): {
    hasTypeScript: boolean;
    hasTailwind: boolean;
    hasAppRouter: boolean;
    componentNaming?: string;
} {
    const allContent = results.map(r => r.data || '').join('\n');
    const allPaths = results.map(r => r.metadata?.filePath || '').join('\n');

    return {
        hasTypeScript: allPaths.includes('.ts') || allPaths.includes('.tsx'),
        hasTailwind: allContent.includes('className=') || allContent.includes('tailwind'),
        hasAppRouter: allPaths.includes('/app/') || allContent.includes("'use client'"),
        componentNaming: detectNamingConvention(allPaths),
    };
}

// Helper: Detect component naming convention
function detectNamingConvention(paths: string): string | undefined {
    if (paths.includes('PascalCase') || /[A-Z][a-z]+[A-Z]/.test(paths)) {
        return 'PascalCase';
    }
    if (paths.includes('kebab-case') || /[a-z]+-[a-z]+/.test(paths)) {
        return 'kebab-case';
    }
    return undefined;
}


export const getTaskContextTool = createTool({
    id: 'get-task-context',
    description: `Get comprehensive task context for a development task.
CRITICAL: ALWAYS use this tool BEFORE generating any code to ensure implementation consistency.

This tool searches for relevant code AND analyzes project patterns to provide:
- Existing implementations of similar features to avoid reinventing
- Project-specific conventions (naming patterns, file structure, etc.)
- Related components and utilities that can be reused
- Architecture patterns and coding standards used in the project

WHEN TO USE:
- Before implementing any new feature or component
- Before adding new functionality to existing code
- When you need to understand how the project handles similar tasks
- When you're unsure about the project's architectural patterns

EXAMPLES:
- "Add a user authentication system" → Returns existing auth patterns, related components
- "Create a data visualization dashboard" → Shows existing chart implementations and styling approaches
- "Implement API endpoints for user management" → Reveals existing API patterns and middleware usage

This tool helps maintain consistency and leverage existing solutions rather than creating duplicate or conflicting implementations.`,
    inputSchema: z.object({
        taskDescription: z.string().describe('Description of the development task or feature to implement'),
        namespace: z.string().optional().describe('Optional namespace to search within (used for project isolation)'),
    }),
    outputSchema: CodeContextSchema,
    execute: async ({ context }) => {
        const { taskDescription, namespace } = context;

        try {
            const results = await searchVector({ data: taskDescription, topK: 10, namespace });

            const patterns = analyzeProjectPatterns(results);

            const relevantFiles = results.map((result: any) => {
                const content = result.data || '';
                const fileExists = result.metadata?.fileExists || false;
                return {
                    fileExists,
                    filePath: result.metadata?.filePath || 'unknown',
                    content: content,
                    relevanceScore: result.score,
                };
            });

            return {
                relevantFiles,
                projectPatterns: patterns,
            };
        } catch (error) {
            console.error('[get-task-context] Error:', error);
            return {
                relevantFiles: [],
                projectPatterns: {
                    hasTypeScript: false,
                    hasTailwind: false,
                    hasAppRouter: false,
                    componentNaming: undefined,
                },
            };
        }
    },
});

export const checkFileExistsTool = createTool({
    id: 'check-file-exists',
    description: `Check if a specific file exists in the codebase.
CRITICAL: ALWAYS use this tool BEFORE adding any imports or references to avoid broken dependencies.

This tool verifies file existence and provides:
- Confirmation if a file exists at the specified path
- Possible alternative file paths if the exact path doesn't exist
- File content preview to verify it's the correct file

WHEN TO USE:
- Before adding import statements for any file
- Before referencing components, utilities, or modules
- When you're unsure about the exact file path
- Before creating new files to avoid duplicates
- When troubleshooting import errors or missing dependencies

EXAMPLES:
- Before adding "import { Button } from '@/components/ui/button'" → Check if button component exists
- Before referencing "@/lib/utils" → Verify the utils file exists at that path
- When looking for a specific configuration file → Check if it exists and where

This tool prevents broken imports, missing file errors, and helps identify the correct paths for existing project files.`,
    inputSchema: z.object({
        filePath: z.string().describe('Path of the file to check'),
        namespace: z.string().optional().describe('Optional namespace to search within (used for project isolation)'),
    }),
    outputSchema: z.object({
        fileExists: z.boolean(),
    }),
    execute: async ({ context }) => {
        const { filePath, namespace } = context;

        try {
            const results = await searchVector({ data: filePath, topK: 3, namespace });
            return { fileExists: results.length > 0, possibleFiles: results.map((result: any) => { return { filePath: result.metadata?.filePath, content: result.data } }) };
        } catch (error) {
            console.error('[check-file-exists] Error:', error);
            return { fileExists: false };
        }
    },
});