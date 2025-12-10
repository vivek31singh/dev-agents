import { langwatch } from "@/lib/langwatch";
import { Agent } from "@mastra/core/agent";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";


async function getPrompt(name: string): Promise<{
    model: string;
    messages: Array<{
        role: "user" | "assistant" | "system";
        content: string;
    }>;
    prompt?: string;
    temperature?: number;
}> {
    const config = await langwatch.prompts.get(name);
    return config ?? {
        model: "zai-coding-plan/glm-4.6",
        messages: [],
        prompt: "You are a helpful assistant.",
        temperature: 0,
    };
}

const config = await getPrompt("nextjs-coder");

const memory = new Memory({
    storage: new LibSQLStore({ url: "file::memory:" }),
});

export const coderAgent = new Agent({
    name: "nextjs-coder",
    model: config.model,
    instructions: config.prompt ?? "You are a helpful assistant.",
    memory,
});
