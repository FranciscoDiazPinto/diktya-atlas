/**
 * Interfaz común para cualquier proveedor LLM (OpenRouter, Anthropic,
 * OpenAI-compatible). El orquestador solo conoce esta forma — cambiar de
 * proveedor es cambiar qué implementación se instancia en providers/index.ts,
 * sin tocar chat-orchestrator ni las tools.
 */

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Presente en mensajes role="tool": qué tool_call responde. */
  toolCallId?: string;
  /** Presente en mensajes role="tool": nombre de la tool invocada. */
  name?: string;
  /** Presente en mensajes role="assistant" que pidieron ejecutar tools — necesario para reconstruir el turno al reenviarlo al proveedor. */
  toolCalls?: LlmToolCall[];
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  /** JSON Schema generado desde el Zod schema de la tool (ver tools/registry.ts). */
  parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface LlmChatResult {
  message: LlmMessage;
  toolCalls: LlmToolCall[];
}

export interface LlmChatParams {
  messages: LlmMessage[];
  /** Tools ya filtradas por rol — el provider nunca decide esto. */
  tools: LlmToolDefinition[];
}

export interface LlmProvider {
  chat(params: LlmChatParams): Promise<LlmChatResult>;
}
