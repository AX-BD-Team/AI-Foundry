export interface Env {
  DB_GOVERNANCE: D1Database;
  KV_PROMPTS: KVNamespace;
  SECURITY: Fetcher;
  ENVIRONMENT: string;
  SERVICE_NAME: string;
  INTERNAL_API_SECRET: string;
}
