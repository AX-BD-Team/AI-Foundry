export interface Env {
  // D1 database for policy candidates and HITL review records
  DB_POLICY: D1Database;

  // Service bindings
  SECURITY: Fetcher;
  LLM_ROUTER: Fetcher;
  NOTIFICATION: Fetcher;

  // Queue producer for pipeline events
  QUEUE_PIPELINE: Queue;

  // Durable Object namespace for HITL session state
  HITL_SESSION: DurableObjectNamespace;

  // Vars
  ENVIRONMENT: string;
  SERVICE_NAME: string;

  // Secrets (set via `wrangler secret put`)
  INTERNAL_API_SECRET: string;
}
