export interface Env {
  DB_INGESTION: D1Database;
  R2_DOCUMENTS: R2Bucket;
  QUEUE_PIPELINE: Queue;
  SECURITY: Fetcher;
  ENVIRONMENT: string;
  SERVICE_NAME: string;
  MAX_FILE_SIZE_MB: string;
  INTERNAL_API_SECRET: string;
}
