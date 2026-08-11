import type { LlmChatParams, LlmChatResult, LlmProvider, LlmToolCall } from "../provider.js";

interface OpenAiStyleToolCall {
  id: string;
  function: { name: string; arguments: string };
}

export interface OpenAiStyleResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: OpenAiStyleToolCall[];
    };
  }>;
}

/** Formato de chat completions estilo OpenAI, usado tanto por OpenRouter como por el provider OpenAI-compatible. */
export function buildOpenAiStylePayload(model: string, params: LlmChatParams) {
  return {
    model,
    messages: params.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.role === "tool" ? { tool_call_id: m.toolCallId, name: m.name } : {}),
      ...(m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0
        ? {
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
            })),
          }
        : {}),
    })),
    ...(params.tools.length > 0
      ? {
          tools: params.tools.map((t) => ({
            type: "function" as const,
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
        }
      : {}),
  };
}

export function parseOpenAiStyleResponse(json: OpenAiStyleResponse): LlmChatResult {
  const choice = json.choices[0];
  if (!choice) {
    throw new Error("Respuesta del proveedor LLM sin choices");
  }
  const toolCalls: LlmToolCall[] = (choice.message.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments),
  }));
  return {
    message: { role: "assistant", content: choice.message.content ?? "", toolCalls },
    toolCalls,
  };
}

/** Sitio opera sin WAN garantizada — un host inalcanzable debe fallar visible en vez de colgar el turno de chat, ver routes/chat.ts. */
const TIMEOUT_CHAT_MS = 30_000;

export class OpenRouterProvider implements LlmProvider {
  constructor(
    private apiKey: string,
    private model = "anthropic/claude-sonnet-4.5"
  ) {}

  async chat(params: LlmChatParams): Promise<LlmChatResult> {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildOpenAiStylePayload(this.model, params)),
      signal: AbortSignal.timeout(TIMEOUT_CHAT_MS),
    });
    if (!res.ok) {
      throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`);
    }
    return parseOpenAiStyleResponse((await res.json()) as OpenAiStyleResponse);
  }
}
