import { z } from "zod";
import { ok, created, badRequest, createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const AuditLogEntrySchema = z.object({
  userId: z.string(),
  organizationId: z.string(),
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  ipAddress: z.string().optional(),
});

type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export async function handleWriteAudit(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const logger = createLogger("svc-security");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = AuditLogEntrySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid request", parsed.error.flatten());
  }

  const entry = parsed.data;
  const auditId = crypto.randomUUID();
  const occurredAt = new Date().toISOString();

  ctx.waitUntil(writeAuditRecord(env.DB_SECURITY, auditId, entry, occurredAt, logger));

  return created({ auditId, occurredAt });
}

const QueryAuditSchema = z.object({
  userId: z.string().optional(),
  organizationId: z.string().optional(),
  resource: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export async function handleQueryAudit(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams);

  const parsed = QueryAuditSchema.safeParse({
    ...params,
    limit: params["limit"] ? parseInt(params["limit"], 10) : undefined,
    offset: params["offset"] ? parseInt(params["offset"], 10) : undefined,
  });

  if (!parsed.success) {
    return badRequest("Invalid query parameters", parsed.error.flatten());
  }

  const { userId, organizationId, resource, fromDate, toDate, limit, offset } = parsed.data;

  let query = "SELECT * FROM audit_log WHERE 1=1";
  const bindings: (string | number)[] = [];

  if (userId) { query += " AND user_id = ?"; bindings.push(userId); }
  if (organizationId) { query += " AND organization_id = ?"; bindings.push(organizationId); }
  if (resource) { query += " AND resource = ?"; bindings.push(resource); }
  if (fromDate) { query += " AND occurred_at >= ?"; bindings.push(fromDate); }
  if (toDate) { query += " AND occurred_at <= ?"; bindings.push(toDate); }

  query += " ORDER BY occurred_at DESC LIMIT ? OFFSET ?";
  bindings.push(limit, offset);

  const result = await env.DB_SECURITY.prepare(query).bind(...bindings).all();

  return ok({
    items: result.results,
    pagination: { page: Math.floor(offset / limit) + 1, limit, total: result.results.length },
  });
}

async function writeAuditRecord(
  db: D1Database,
  auditId: string,
  entry: AuditLogEntry,
  occurredAt: string,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO audit_log
          (audit_id, user_id, organization_id, action, resource, resource_id, details, ip_address, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        entry.userId,
        entry.organizationId,
        entry.action,
        entry.resource,
        entry.resourceId ?? null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ipAddress ?? null,
        occurredAt,
      )
      .run();
  } catch (e) {
    logger.error("Failed to write audit log", { error: String(e), auditId });
  }
}
