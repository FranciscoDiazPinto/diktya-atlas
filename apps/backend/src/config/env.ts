import { z } from "zod";

/**
 * Carga y valida todas las variables de entorno una sola vez, al arrancar.
 * Fail-fast: si falta algo requerido, el proceso no debe ni intentar
 * levantar el servidor/worker con configuración a medias.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerido"),
  REDIS_URL: z.string().min(1, "REDIS_URL es requerido"),

  UNIFI_MODE: z.enum(["mock", "live"]).default("mock"),
  UNIFI_HOST: z.string().optional(),
  UNIFI_PORT: z.coerce.number().int().positive().optional(),
  UNIFI_USERNAME: z.string().optional(),
  UNIFI_PASSWORD: z.string().optional(),
  UNIFI_SITE: z.string().default("default"),
  UNIFI_VERIFY_TLS: z.coerce.boolean().default(true),

  OPNSENSE_HOST: z.string().optional(),
  OPNSENSE_API_KEY: z.string().optional(),
  OPNSENSE_API_SECRET: z.string().optional(),

  PROXMOX_HOST: z.string().optional(),
  PROXMOX_SVC_ACCOUNT: z.string().optional(),
  PROXMOX_SVC_TOKEN: z.string().optional(),

  LLM_PROVIDER: z.enum(["openrouter", "anthropic", "openai"]).default("openrouter"),
  OPENROUTER_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().optional(),
  EMAIL_SMTP_URL: z.string().optional(),
  GENERIC_WEBHOOK_URL: z.string().optional(),

  JWT_SECRET: z.string().optional(),
});

function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Configuración de entorno inválida:", parsed.error.flatten().fieldErrors);
    throw new Error("Variables de entorno inválidas o incompletas");
  }

  if (parsed.data.UNIFI_MODE === "live") {
    const missing = ["UNIFI_HOST", "UNIFI_USERNAME", "UNIFI_PASSWORD"].filter(
      (key) => !parsed.data[key as keyof typeof parsed.data]
    );
    if (missing.length > 0) {
      throw new Error(
        `UNIFI_MODE=live requiere: ${missing.join(", ")}`
      );
    }
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
