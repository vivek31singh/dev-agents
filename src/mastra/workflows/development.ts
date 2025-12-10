import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const generateCodeStep = createStep({
    id: "generate-code",
    inputSchema: z.object({
        prompt: z.string(),
        chatId: z.string().optional(),
    }),
    outputSchema: z.object({
        output: z.string(),
    }),
    execute: async ({ inputData, mastra }) => {
        const { prompt, chatId } = inputData;

        let fullPrompt = prompt;
        if (chatId) {
            fullPrompt += `\n\n[System Note: Continue working on project with chatId: ${chatId}]`;
        }

        const agent = mastra.getAgent('coder-agent');

        if(!agent) throw new Error('Coder agent not found');

        const result = await agent.generate(fullPrompt);

        return {
            output: result.text,
        };
    },
});

export const developmentWorkflow = createWorkflow({
    id: "development-workflow",
    inputSchema: z.object({
        prompt: z.string(),
        chatId: z.string().optional(),
    }),
    outputSchema: z.object({
        output: z.string(),
    }),
    steps:[
        generateCodeStep,
    ]
}).then(generateCodeStep)
    .commit();
