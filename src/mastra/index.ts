import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { ConsoleLogger, LogLevel } from "@mastra/core/logger";

import { projectContextAgent } from "./agents";
import { nextjsCoderAgent } from "./agents/nextjs-coder";
import { codeCriticAgent } from "./agents/code-critic";

import { developmentWorkflow } from "./workflows/development";
import { initializeProjectWorkflow } from "./workflows/initialize-project";

const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || "info";

export const mastra = new Mastra({
  agents: {
    projectContextAgent,
    nextjsCoderAgent,
    codeCriticAgent,
  },
  workflows: {
    initializeProjectWorkflow,
    developmentWorkflow,
  },
  storage: new LibSQLStore({
    url: ":memory:",
  }),
  logger: new ConsoleLogger({
    level: LOG_LEVEL,
  }),
});
