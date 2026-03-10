import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { getPromptSet, renderStep, stepLabel, stepText } from "./prompts";

const CRITIC_SYSTEM_PROMPT =
  "You are a rigorous critic and devil's advocate. Your role is to challenge assumptions, " +
  "expose logical flaws, identify unstated risks, and argue the strongest counterposition to " +
  "any claim. Be direct, do not hedge.";

export interface ChainOutput {
  final: string;
  steps: string[];
}

export function resolveModel(model: string): BaseChatModel {
  if (model.startsWith("claude-")) {
    return new ChatAnthropic({ model });
  }
  if (model.startsWith("gpt-")) {
    return new ChatOpenAI({ model });
  }
  if (model.startsWith("gemini-")) {
    return new ChatGoogleGenerativeAI({ model });
  }
  throw new Error(`Unknown model prefix: "${model}"`);
}

export async function runChain({
  model,
  promptSet,
  variables,
}: {
  model: string;
  promptSet: string;
  variables: Record<string, string>;
}): Promise<ChainOutput> {
  const promptFile = getPromptSet(promptSet);

  if (promptFile.variables) {
    for (const v of promptFile.variables) {
      if (!(v in variables)) {
        throw new Error(`Missing required variable: "${v}"`);
      }
    }
  }

  const prompts = promptFile.steps.map((step) => renderStep(stepText(step), variables));

  if (prompts.length === 0) {
    throw new Error("prompts must not be empty");
  }

  const llm = resolveModel(model);
  const steps: string[] = [];
  const total = prompts.length;

  for (let i = 0; i < prompts.length; i++) {
    console.log(`[chain] ${stepLabel(promptFile.steps[i], i)} (${i + 1}/${total})`);

    const userContent =
      i === 0 ? prompts[i] : `Previous analysis:\n${steps[i - 1]}\n\n${prompts[i]}`;

    const response = await llm.invoke([
      new SystemMessage(CRITIC_SYSTEM_PROMPT),
      new HumanMessage(userContent),
    ]);

    const text =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    steps.push(text);
  }

  return { final: steps[steps.length - 1], steps };
}
