import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchVector, storeVector, removeVectors } from '@/lib/vector';

/**
 * RAG Tools for Code Generation Workflow
 * 
 * These tools enable agents to:
 * 1. Search existing codebase for context and patterns
 * 2. Store new code in the vector database
 * 3. Query for similar implementations
 */

// Schema for search results
const SearchResultSchema = z.object({
    matches: z.array(z.object({
        id: z.string(),
        score: z.number(),
        filePath: z.string(),
        fileName: z.string(),
        content: z.string(),
        chunkIndex: z.number().optional(),
        totalChunks: z.number().optional(),
    })),
    totalMatches: z.number(),
});

// Schema for code context
const CodeContextSchema = z.object({
    query: z.string(),
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

/**
 * Search Codebase Tool
 * 
 * Queries the vector store to find relevant code snippets based on semantic search.
 * Used by agents to understand existing patterns and implementations.
 */
export const searchCodebaseTool = createTool({
    id: 'search-codebase',
    description: `Search the existing codebase for relevant code snippets, patterns, and implementations.
Use this tool to:
- Find similar components or implementations
- Understand existing project patterns and conventions
- Get context about how specific features are implemented
- Find related files for a given task`,
    inputSchema: z.object({
        query: z.string().describe('Semantic search query describing what you are looking for. Be specific about the functionality, component type, or pattern.'),
        maxResults: z.number().optional().default(5).describe('Maximum number of results to return (default: 5)'),
    }),
    outputSchema: SearchResultSchema,
    execute: async ({ context }) => {
        const { query, maxResults = 5 } = context;

        try {
            const results = await searchVector({ data: query, topK: maxResults });

            const matches = results
                .slice(0, maxResults)
                .map((result: any) => ({
                    id: result.id,
                    score: result.score,
                    filePath: result.metadata?.filePath || 'unknown',
                    fileName: result.metadata?.fileName || 'unknown',
                    content: result.data || '',
                    chunkIndex: result.metadata?.chunkIndex,
                    totalChunks: result.metadata?.totalChunks,
                }));

            return {
                matches,
                totalMatches: matches.length,
            };
        } catch (error) {
            console.error('[search-codebase] Error:', error);
            return {
                matches: [],
                totalMatches: 0,
            };
        }
    },
});

/**
 * Get Code Context Tool
 * 
 * Comprehensive context retrieval for code generation tasks.
 * Searches for relevant code AND analyzes project patterns.
 */
export const getCodeContextTool = createTool({
    id: 'get-code-context',
    description: `Get comprehensive code context for a development task.
This tool searches for relevant existing code AND analyzes project patterns.
Use before generating code to understand:
- How similar features are implemented
- Project-specific conventions and patterns
- Related components and utilities`,
    inputSchema: z.object({
        taskDescription: z.string().describe('Description of the development task or feature to implement'),
        fileTypes: z.array(z.string()).optional().describe('Optional file types to prioritize (e.g., ["component", "hook", "api"])'),
    }),
    outputSchema: CodeContextSchema,
    execute: async ({ context }) => {
        const { taskDescription, fileTypes } = context;

        try {
            // Build enhanced query with file type hints
            let enhancedQuery = taskDescription;
            if (fileTypes && fileTypes.length > 0) {
                enhancedQuery += ` (${fileTypes.join(', ')})`;
            }

            const results = await searchVector({ data: enhancedQuery, topK: 5 });

            // Analyze results for project patterns
            const patterns = analyzeProjectPatterns(results);

            const relevantFiles = results.slice(0, 5).map((result: any) => ({
                filePath: result.metadata?.filePath || 'unknown',
                content: result.data || '',
                relevanceScore: result.score,
            }));

            return {
                query: taskDescription,
                relevantFiles,
                projectPatterns: patterns,
            };
        } catch (error) {
            console.error('[get-code-context] Error:', error);
            return {
                query: taskDescription,
                relevantFiles: [],
            };
        }
    },
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
