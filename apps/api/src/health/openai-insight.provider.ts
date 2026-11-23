import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AIInsightProviderPort } from "./ai-insight.provider";

@Injectable()
export class OpenAIInsightProvider implements AIInsightProviderPort {
  readonly providerName = "OpenAI-compatible";
  readonly modelName: string;

  constructor(private readonly config: ConfigService) {
    this.modelName = config.get<string>("AI_MODEL") ?? "unconfigured";
  }

  async generate(input: { systemPrompt: string; userPrompt: string }) {
    const apiKey = this.config.get<string>("AI_API_KEY");
    const apiUrl =
      this.config.get<string>("AI_API_URL") ??
      "https://api.openai.com/v1/chat/completions";
    const model = this.config.get<string>("AI_MODEL");
    if (!apiKey || !model) {
      throw new ServiceUnavailableException("AI provider is not configured");
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
      }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException("AI provider request failed");
    }
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new ServiceUnavailableException("AI provider returned no content");
    }
    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new ServiceUnavailableException("AI provider returned invalid JSON");
    }
  }
}
