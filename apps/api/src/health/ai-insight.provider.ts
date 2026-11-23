export interface AIInsightProviderPort {
  generate(input: {
    systemPrompt: string;
    userPrompt: string;
  }): Promise<unknown>;
  providerName: string;
  modelName: string;
}

export const AI_INSIGHT_PROVIDER = Symbol("AI_INSIGHT_PROVIDER");
