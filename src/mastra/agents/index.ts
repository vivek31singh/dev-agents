import { Agent } from "@mastra/core/agent";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { LangWatch } from "langwatch";

const langwatch = new LangWatch({
  apiKey: process.env.LANGWATCH_API_KEY,
});

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

const config = await getPrompt("project-context-agent");

const memory = new Memory({
  storage: new LibSQLStore({ url: "file::memory:" }),
});

export const projectContextAgent = new Agent({
  name: "project-context-agent",
  model: config.model,
  instructions: config.prompt ?? "You are a helpful assistant.",
  memory,
});
