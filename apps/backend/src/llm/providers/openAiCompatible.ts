import type { LlmChatParams, LlmChatResult, LlmProvider } from "../provider.js";
import { buildOpenAiStylePayload, parseOpenAiStyleResponse, type OpenAiStyleResponse } from "./openRouter.js";

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(
    private apiKey: string,
    private baseUrl = "https://api.openai.com/v1",
    private model = "gpt-4.1"
  ) {}

  async chat(params: LlmChatParams): Promise<LlmChatResult> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildOpenAiStylePayload(this.model, params)),
    });
    if (!res.ok) {
      throw new Error(`Proveedor OpenAI-compatible error: ${res.status} ${await res.text()}`);
    }
    return parseOpenAiStyleResponse((await res.json()) as OpenAiStyleResponse);
  }
}
