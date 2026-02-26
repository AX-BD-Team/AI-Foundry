export interface Env {
  DB_ANALYTICS: D1Database;
  SECURITY: Fetcher;
  ENVIRONMENT: string;
  SERVICE_NAME: string;
  INTERNAL_API_SECRET: string;
}
