import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const generateCodeStep = createStep({
    id: "generate-code",
    inputSchema: z.object({
        prompt: z.string(),
    }),
    outputSchema: z.object({
        output: z.string(),
        files: z.array(z.object({
            path: z.string(),
            content: z.string(),
        })).optional(),
    }),
    execute: async ({ inputData, mastra }) => {
        const { prompt } = inputData;

        const agent = mastra.getAgent("nextjsCoderAgent");

        if (!agent) throw new Error('Coder agent not found');

        const result = await agent.generate(prompt, {
            instructions: `You are a Next.js development specialist.
            
IMPORTANT: You must respond with a JSON object matching this structure:
{
  "output": "Main summary and response text",
  "files": [
    { "path": "src/app/page.tsx", "content": "..." }
  ]
}

Follow this systematic approach:

1. ANALYSIS & PLANNING
   - Identify requirements and dependencies
   - Design component structure

2. IMPLEMENTATION
   - Generate production-ready Next.js (App Router) code
   - Use TypeScript and Tailwind CSS
   - Use standard shadcn/ui components

3. RESPONSE
   - Provide the explanation in the 'output' field
   - Provide the code in the 'files' array

Adhere to Next.js best practices (Server Components, etc).`,
            structuredOutput: {
                schema: z.object({
                    output: z.string(),
                    files: z.array(z.object({
                        path: z.string(),
                        content: z.string(),
                    })).optional(),
                }),
                errorStrategy: 'warn'
            }
        });

        console.log("Structured Output Result:", JSON.stringify(result.object, null, 2));

        if (!result.object) {
            // Fallback if structured output fails
            return {
                output: result.text || "No output generated",
            };
        }

        return {
            output: result.object.output || result.text || "No output",
            files: result.object.files,
        };
    },
});

export const developmentWorkflow = createWorkflow({
    id: "development-workflow",
    inputSchema: z.object({
        prompt: z.string(),
    }),
    outputSchema: z.object({
        output: z.string(),
        files: z.array(z.object({
            path: z.string(),
            content: z.string(),
        })).optional(),
    }),
    steps: [
        generateCodeStep,
    ]
}).then(generateCodeStep)
    .commit();
