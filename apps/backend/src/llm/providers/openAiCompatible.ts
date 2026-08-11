import type { LlmChatParams, LlmChatResult, LlmProvider } from "../provider.js";
import { buildOpenAiStylePayload, parseOpenAiStyleResponse, type OpenAiStyleResponse } from "./openRouter.js";

/** Sitio opera sin WAN garantizada — un host inalcanzable debe fallar visible en vez de colgar el turno de chat, ver routes/chat.ts. */
const TIMEOUT_CHAT_MS = 30_000;

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
      signal: AbortSignal.timeout(TIMEOUT_CHAT_MS),
    });
    if (!res.ok) {
      throw new Error(`Proveedor OpenAI-compatible error: ${res.status} ${await res.text()}`);
    }
    return parseOpenAiStyleResponse((await res.json()) as OpenAiStyleResponse);
  }
}
