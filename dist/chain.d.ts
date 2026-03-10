import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
export interface ChainOutput {
    final: string;
    steps: string[];
}
export declare function resolveModel(model: string): BaseChatModel;
export declare function runChain({ model, prompts, }: {
    model: string;
    prompts: string[];
}): Promise<ChainOutput>;
