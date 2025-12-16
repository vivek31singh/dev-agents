import { getPrompt } from "@/lib/langwatch";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { getTaskContextTool, checkFileExistsTool } from "../tools";
import { dbStore } from "@/lib/db-config";

const config = await getPrompt("nextjs-coder");

const memory = new Memory({
    storage: dbStore,
});

// Wrap tools with enhanced error handling
const wrappedGetTaskContextTool = {
    ...getTaskContextTool,
    execute: async (args: any) => {
        try {
            console.log('[nextjs-coder-agent] Executing getTaskContextTool');
            const result = await getTaskContextTool.execute(args);
            console.log('[nextjs-coder-agent] getTaskContextTool executed successfully');
            return result;
        } catch (error) {
            console.error('[nextjs-coder-agent] getTaskContextTool failed:');
            // Return fallback response when tool fails
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
    }
};

const wrappedCheckFileExistsTool = {
    ...checkFileExistsTool,
    execute: async (args: any) => {
        try {
            console.log('[nextjs-coder-agent] Executing checkFileExistsTool');
            const result = await checkFileExistsTool.execute(args);
            console.log('[nextjs-coder-agent] checkFileExistsTool executed successfully');
            return result;
        } catch (error) {
            console.error('[nextjs-coder-agent] checkFileExistsTool failed:');
            // Return fallback response when tool fails
            return { fileExists: false };
        }
    }
};

export const nextjsCoderAgent = new Agent({
    name: "nextjs-coder-agent",
    model: config.model,
    instructions: config.prompt ?? "You are a helpful nextjs coder assistant.",
    memory,
    tools: {
        getTaskContextTool: wrappedGetTaskContextTool,
        checkFileExistsTool: wrappedCheckFileExistsTool
    }
});
