export interface Env {
  // D1 database for extraction job metadata and results
  DB_EXTRACTION: D1Database;

  // Queue producer — pipeline event bus
  QUEUE_PIPELINE: Queue;

  // Service bindings
  SECURITY: Fetcher;
  LLM_ROUTER: Fetcher;
  SVC_INGESTION: Fetcher;

  // Vars
  ENVIRONMENT: string;
  SERVICE_NAME: string;

  // R2 bucket for spec package storage (Phase 2-C)
  R2_SPEC_PACKAGES: R2Bucket;

  // Secrets (set via `wrangler secret put`)
  INTERNAL_API_SECRET: string;
}
