/**
 * Notification CRUD handlers for svc-notification.
 * GET  /notifications       — list notifications for a user
 * PATCH /notifications/:id/read — mark a notification as read
 */

import { createLogger, ok, notFound, badRequest } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-notification:routes");

interface NotificationRow {
  notification_id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string;
  metadata: string | null;
  channel: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  read_at: string | null;
}

function formatRow(row: NotificationRow) {
  return {
    notificationId: row.notification_id,
    recipientId: row.recipient_id,
    type: row.type,
    title: row.title,
    body: row.body,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    channel: row.channel,
    status: row.status,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    readAt: row.read_at,
  };
}

export async function handleListNotifications(
  req: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return badRequest("userId query parameter is required");
  }

  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 100);
  const offset = Number(url.searchParams.get("offset")) || 0;

  let sql = "SELECT * FROM notifications WHERE recipient_id = ?";
  const params: (string | number)[] = [userId];

  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (type) {
    sql += " AND type = ?";
    params.push(type);
  }

  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const result = await env.DB_NOTIFICATION.prepare(sql)
    .bind(...params)
    .all<NotificationRow>();

  const notifications = result.results.map(formatRow);

  logger.info("Listed notifications", { userId, count: notifications.length });

  return ok({ notifications, limit, offset });
}

export async function handleMarkRead(
  _req: Request,
  env: Env,
  notificationId: string,
): Promise<Response> {
  const now = new Date().toISOString();

  const existing = await env.DB_NOTIFICATION.prepare(
    "SELECT notification_id, status FROM notifications WHERE notification_id = ?",
  )
    .bind(notificationId)
    .first<{ notification_id: string; status: string }>();

  if (!existing) {
    return notFound("notification", notificationId);
  }

  if (existing.status === "read") {
    return ok({ notificationId, status: "read", message: "Already read" });
  }

  await env.DB_NOTIFICATION.prepare(
    "UPDATE notifications SET status = 'read', read_at = ? WHERE notification_id = ?",
  )
    .bind(now, notificationId)
    .run();

  logger.info("Notification marked read", { notificationId });

  return ok({ notificationId, status: "read" });
}
