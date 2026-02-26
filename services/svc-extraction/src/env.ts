export interface Env {
  // D1 database for extraction job metadata and results
  DB_EXTRACTION: D1Database;

  // Service bindings
  SECURITY: Fetcher;
  LLM_ROUTER: Fetcher;

  // Vars
  ENVIRONMENT: string;
  SERVICE_NAME: string;

  // Secrets (set via `wrangler secret put`)
  INTERNAL_API_SECRET: string;
}
