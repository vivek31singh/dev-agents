import { getPrompt } from "@/lib/langwatch";
import { Agent } from "@mastra/core/agent";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";




const config = await getPrompt("nextjs-coder");

const memory = new Memory({
    storage: new LibSQLStore({ url: "file::memory:" }),
});

export const nextjsCoderAgent = new Agent({
    name: "nextjs-coder-agent",
    model: config.model,
    instructions: config.prompt ?? "You are a helpful assistant.",
    memory,
});
