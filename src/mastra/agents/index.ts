import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { getPrompt } from "@/lib/langwatch";
import { getTaskContextTool } from "../tools";
import { dbStore } from "@/lib/db-config";
import { planCreationAgent } from "./plan-creation";

const config = await getPrompt("project-context-agent");

const memory = new Memory({
  storage: dbStore,
});

export const projectContextAgent = new Agent({
  name: "project-context-agent",
  model: config.model,
  instructions: config.prompt ?? "You are a helpful assistant.",
  memory,
  tools: {
    getTaskContextTool,
  }
});

export { planCreationAgent };
