import { getPrompt } from "@/lib/langwatch";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { context7Mcp } from "../mcp/context7";
import { dbStore } from "@/lib/db-config";

const config = await getPrompt("plan-creation-agent");

const memory = new Memory({
    storage: dbStore,
});

const context7Tools = await context7Mcp.getTools();

export const planCreationAgent = new Agent({
    name: "plan-creation-agent",
    model: config.model,
    instructions: config.prompt ?? "You are a technical planning specialist.",
    memory,
    tools: {
        ...context7Tools,
    }
});