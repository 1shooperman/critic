"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveModel = resolveModel;
exports.runChain = runChain;
const anthropic_1 = require("@langchain/anthropic");
const google_genai_1 = require("@langchain/google-genai");
const openai_1 = require("@langchain/openai");
const messages_1 = require("@langchain/core/messages");
const CRITIC_SYSTEM_PROMPT = "You are a rigorous critic and devil's advocate. Your role is to challenge assumptions, " +
    "expose logical flaws, identify unstated risks, and argue the strongest counterposition to " +
    "any claim. Be direct, do not hedge.";
function resolveModel(model) {
    if (model.startsWith("claude-")) {
        return new anthropic_1.ChatAnthropic({ model });
    }
    if (model.startsWith("gpt-")) {
        return new openai_1.ChatOpenAI({ model });
    }
    if (model.startsWith("gemini-")) {
        return new google_genai_1.ChatGoogleGenerativeAI({ model });
    }
    throw new Error(`Unknown model prefix: "${model}"`);
}
async function runChain({ model, prompts, }) {
    if (prompts.length === 0) {
        throw new Error("prompts must not be empty");
    }
    const llm = resolveModel(model);
    const steps = [];
    for (let i = 0; i < prompts.length; i++) {
        const userContent = i === 0 ? prompts[i] : `Previous analysis:\n${steps[i - 1]}\n\n${prompts[i]}`;
        const response = await llm.invoke([
            new messages_1.SystemMessage(CRITIC_SYSTEM_PROMPT),
            new messages_1.HumanMessage(userContent),
        ]);
        const text = typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content);
        steps.push(text);
    }
    return { final: steps[steps.length - 1], steps };
}
//# sourceMappingURL=chain.js.map