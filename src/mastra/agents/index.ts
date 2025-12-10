import { Agent } from "@mastra/core/agent";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { getPrompt } from "@/lib/langwatch";

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
