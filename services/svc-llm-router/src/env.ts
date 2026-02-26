export interface Env {
  // D1 database for cost/usage logging
  DB_LLM: D1Database;

  // KV for prompt registry cache
  KV_PROMPTS: KVNamespace;

  // Vars
  ENVIRONMENT: string;
  SERVICE_NAME: string;

  // Secrets (set via wrangler secret put)
  INTERNAL_API_SECRET: string;
  ANTHROPIC_API_KEY: string;
  CLOUDFLARE_AI_GATEWAY_URL: string;
}
