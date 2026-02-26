import { ok } from "@ai-foundry/utils";

export function handleHealth(): Response {
  return ok({
    service: "svc-llm-router",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
