import { LangWatch } from "langwatch";

export const langwatch = new LangWatch({
  apiKey: process.env.LANGWATCH_API_KEY,
});