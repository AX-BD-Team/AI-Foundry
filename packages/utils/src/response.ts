import type { ApiResponse, ApiError } from "@ai-foundry/types";
import { isAppError } from "./errors.js";

const JSON_HEADERS = {
  "Content-Type": "application/json",
} as const;

export function ok<T>(data: T, status = 200): Response {
  const body: ApiResponse<T> = { success: true, data };
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

export function created<T>(data: T): Response {
  return ok(data, 201);
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function err(error: ApiError, status = 500): Response {
  const body: ApiResponse<never> = { success: false, error };
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

export function errFromUnknown(e: unknown): Response {
  if (isAppError(e)) {
    return err(
      { code: e.code, message: e.message, details: e.details },
      e.statusCode,
    );
  }
  const message = e instanceof Error ? e.message : "Internal server error";
  return err({ code: "INTERNAL_ERROR", message }, 500);
}

export function notFound(resource: string, id?: string): Response {
  const message = id
    ? `${resource} '${id}' not found`
    : `${resource} not found`;
  return err({ code: "NOT_FOUND", message }, 404);
}

export function unauthorized(message = "Unauthorized"): Response {
  return err({ code: "UNAUTHORIZED", message }, 401);
}

export function forbidden(message = "Forbidden"): Response {
  return err({ code: "FORBIDDEN", message }, 403);
}

export function badRequest(message: string, details?: unknown): Response {
  return err({ code: "VALIDATION_ERROR", message, details }, 400);
}
