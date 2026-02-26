import { createLogger, unauthorized } from "@ai-foundry/utils";
import type { Env } from "./env.js";
import { handleHealth } from "./routes/health.js";
import { handleComplete } from "./routes/complete.js";
import { handleStream } from "./routes/stream.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const logger = createLogger("svc-llm-router");
    const url = new URL(request.url);

    // Health check — no auth required
    if (request.method === "GET" && url.pathname === "/health") {
      return handleHealth();
    }

    // All other routes require inter-service secret
    const secret = request.headers.get("X-Internal-Secret");
    if (!secret || secret !== env.INTERNAL_API_SECRET) {
      logger.warn("Unauthorized request", {
        path: url.pathname,
        method: request.method,
      });
      return unauthorized("Missing or invalid X-Internal-Secret");
    }

    const method = request.method;
    const path = url.pathname;

    try {
      if (method === "POST" && path === "/complete") {
        return await handleComplete(request, env, ctx);
      }

      if (method === "POST" && path === "/stream") {
        return await handleStream(request, env, ctx);
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
