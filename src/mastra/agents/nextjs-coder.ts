import { getPrompt } from "@/lib/langwatch";
import { Agent } from "@mastra/core/agent";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { searchCodebaseTool, getCodeContextTool } from "../tools/rag-tools";

const config = await getPrompt("nextjs-coder");
console.log("[nextjs-coder] Model Config:", JSON.stringify(config.model));
console.log("[nextjs-coder] Prompt Length:", config.prompt?.length);

const memory = new Memory({
    storage: new LibSQLStore({ url: "file::memory:" }),
});

export const nextjsCoderAgent = new Agent({
    name: "nextjs-coder-agent",
    // Tools are disabled for the Coder because the Workflow handles Context Retrieval (RAG)
    // and passes it via the system prompt. This ensures robust JSON generation.
    model: config.model,
    instructions: config.prompt ?? "You are a helpful nextjs coder assistant.",
    memory
});
