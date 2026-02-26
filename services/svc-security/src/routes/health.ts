import { ok } from "@ai-foundry/utils";

export function handleHealth(): Response {
  return ok({
    service: "svc-security",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
