import { env } from "../../config/env.js";
import type { LlmProvider } from "../provider.js";
import { OpenRouterProvider } from "./openRouter.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAiCompatibleProvider } from "./openAiCompatible.js";

export { OpenRouterProvider } from "./openRouter.js";
export { AnthropicProvider } from "./anthropic.js";
export { OpenAiCompatibleProvider } from "./openAiCompatible.js";

let instance: LlmProvider | undefined;

export function getLlmProvider(): LlmProvider {
  if (instance) return instance;

  switch (env.LLM_PROVIDER) {
    case "anthropic":
      if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");
      instance = new AnthropicProvider(env.ANTHROPIC_API_KEY);
      break;
    case "openai":
      if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no configurada");
      instance = new OpenAiCompatibleProvider(env.OPENAI_API_KEY, env.OPENAI_BASE_URL);
      break;
    case "openrouter":
    default:
      if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY no configurada");
      instance = new OpenRouterProvider(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL);
      break;
  }
  return instance;
}
