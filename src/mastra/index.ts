import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { projectContextAgent } from "./agents";
import { coderAgent } from "./agents/coder";
import { developmentWorkflow } from "./workflows/development";
import { ConsoleLogger, LogLevel } from "@mastra/core/logger";

const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || "info";

export const mastra = new Mastra({
  agents: {
    projectContextAgent,
    coderAgent,
  },
  workflows: {
    developmentWorkflow,
  },
  storage: new LibSQLStore({
    url: ":memory:",
  }),
  logger: new ConsoleLogger({
    level: LOG_LEVEL,
  }),
});