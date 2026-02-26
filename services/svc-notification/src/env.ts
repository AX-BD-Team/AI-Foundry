export interface Env {
  DB_NOTIFICATION: D1Database;
  QUEUE_PIPELINE: Queue;
  ENVIRONMENT: string;
  SERVICE_NAME: string;
  INTERNAL_API_SECRET: string;
  SLACK_WEBHOOK_URL: string;
}
