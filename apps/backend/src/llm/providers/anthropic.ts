import type { LlmChatParams, LlmChatResult, LlmMessage, LlmProvider, LlmToolCall } from "../provider.js";

interface AnthropicContentBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
}

function toAnthropicMessage(m: LlmMessage) {
  if (m.role === "tool") {
    return {
      role: "user" as const,
      content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
    };
  }
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
    const blocks: Array<Record<string, unknown>> = [];
    if (m.content) blocks.push({ type: "text", text: m.content });
    for (const tc of m.toolCalls) {
      blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
    }
    return { role: "assistant" as const, content: blocks };
  }
  return {
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: [{ type: "text", text: m.content }],
  };
}

export class AnthropicProvider implements LlmProvider {
  constructor(
    private apiKey: string,
    private model = "claude-sonnet-4-5",
    private maxTokens = 4096
  ) {}

  async chat(params: LlmChatParams): Promise<LlmChatResult> {
    const systemText = params.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const conversation = params.messages.filter((m) => m.role !== "system").map(toAnthropicMessage);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemText || undefined,
        messages: conversation,
        tools:
          params.tools.length > 0
            ? params.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
              }))
            : undefined,
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as AnthropicResponse;
    const text = json.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    const toolCalls: LlmToolCall[] = json.content
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ id: b.id!, name: b.name!, arguments: b.input }));

    return { message: { role: "assistant", content: text, toolCalls }, toolCalls };
  }
}
