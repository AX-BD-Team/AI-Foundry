export interface Env {
  // D1 database for Skill metadata and catalog records
  DB_SKILL: D1Database;

  // R2 bucket for .skill.json package storage
  R2_SKILL_PACKAGES: R2Bucket;

  // Service bindings
  SECURITY: Fetcher;
  LLM_ROUTER: Fetcher;

  // Vars
  ENVIRONMENT: string;
  SERVICE_NAME: string;

  // Secrets (set via `wrangler secret put`)
  INTERNAL_API_SECRET: string;
}
