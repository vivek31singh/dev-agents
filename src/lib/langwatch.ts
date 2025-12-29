import { LangWatch } from "langwatch";

export async function getPrompt(name: string): Promise<{
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
        model: "zhipuai/glm-4.5-flash",
        messages: [],
        prompt: "You are a helpful assistant.",
        temperature: 0,
    };
}

export const langwatch = new LangWatch({
    apiKey: process.env.LANGWATCH_API_KEY,
});