import { describe, it, expect } from "vitest";
import { AgentAdapter, AgentInput, AgentReturnTypes, run, user, agent, judge, userSimulatorAgent, judgeAgent } from "@langwatch/scenario";
import { projectContextAgent } from "@/mastra/agents";
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

// Model for scenario agents (judge and user simulator)
// Note: This requires a valid OPENAI_API_KEY in your .env file
const scenarioModel = openai("gpt-4o-mini");

// Adapter for Mastra Agents
class MastraAgentAdapter extends AgentAdapter {
    private agent: Agent;

    constructor(agent: Agent) {
        super();
        this.agent = agent;
    }

    async call(input: AgentInput): Promise<AgentReturnTypes> {
        const messages = input.messages;
        const lastUserMessage = messages[messages.length - 1].content as string;
        const response = await this.agent.generate(lastUserMessage);
        return response.text;
    }
}

describe("Project Context Agent", () => {
    it("should answer questions about the project structure", async () => {
        const result = await run({
            name: "Project Structure Query",
            description: "User asks about the project structure and the agent provides helpful information.",
            agents: [
                new MastraAgentAdapter(projectContextAgent),
                userSimulatorAgent({ model: scenarioModel }),
                judgeAgent({
                    criteria: [
                        "Agent should acknowledge the question about project structure",
                        "Agent should provide a helpful response",
                        "Response should be clear and informative"
                    ],
                    model: scenarioModel,
                }),
            ],
            script: [
                user("What is this project about and how is it structured?"),
                agent(),
                judge(),
            ],
        });

        expect(result.success).toBe(true);
    });
});
