/**
 * Pages Function — API Proxy
 *
 * Catches all /api/* requests and forwards them to the appropriate
 * staging/production Worker via HTTP fetch.
 *
 * Routing table:
 *   /api/documents/**  → svc-ingestion
 *   /api/extractions/**  → svc-extraction
 *   /api/extract/**  → svc-extraction
 *   /api/policies/**  → svc-policy
 *   /api/sessions/**  → svc-policy
 *   /api/skills/**  → svc-skill
 *   /api/terms/**  → svc-ontology
 *   /api/graph/**  → svc-ontology
 *   /api/normalize/**  → svc-ontology
 *   /api/audit/**  → svc-security
 *   /api/cost/**  → svc-governance
 *   /api/trust/**  → svc-governance
 *   /api/prompts/**  → svc-governance
 *   /api/notifications/**  → svc-notification
 *   /api/kpi/**  → svc-analytics
 *   /api/dashboards/**  → svc-analytics
 */

interface ProxyEnv {
  ENVIRONMENT: string;
  INTERNAL_API_SECRET: string;
}

/** Map first path segment after /api/ to a Worker service name */
const ROUTE_TABLE: Record<string, string> = {
  documents: "svc-ingestion",
  extractions: "svc-extraction",
  extract: "svc-extraction",
  policies: "svc-policy",
  sessions: "svc-policy",
  skills: "svc-skill",
  terms: "svc-ontology",
  graph: "svc-ontology",
  normalize: "svc-ontology",
  audit: "svc-security",
  cost: "svc-governance",
  trust: "svc-governance",
  prompts: "svc-governance",
  notifications: "svc-notification",
  kpi: "svc-analytics",
  dashboards: "svc-analytics",
};

const ACCOUNT_SUBDOMAIN = "sinclair-account";

function getWorkerUrl(serviceName: string, env: string): string {
  const suffix = env === "production" ? "" : "-staging";
  return `https://${serviceName}${suffix}.${ACCOUNT_SUBDOMAIN}.workers.dev`;
}

export const onRequest: PagesFunction<ProxyEnv> = async (context) => {
  const { request, env } = context;

  // Build the sub-path from catch-all params (e.g. ["documents", "doc-123", "chunks"])
  const pathSegments = context.params["path"];
  if (!pathSegments) {
    return Response.json(
      { success: false, error: "Missing API path" },
      { status: 400 },
    );
  }
  const segments = Array.isArray(pathSegments) ? pathSegments : [pathSegments];
  const firstSegment = segments[0];
  if (!firstSegment) {
    return Response.json(
      { success: false, error: "Missing API path" },
      { status: 400 },
    );
  }

  const targetService = ROUTE_TABLE[firstSegment];
  if (!targetService) {
    return Response.json(
      { success: false, error: `Unknown API route: /api/${firstSegment}` },
      { status: 404 },
    );
  }

  const environment = env.ENVIRONMENT ?? "staging";
  const workerBaseUrl = getWorkerUrl(targetService, environment);

  // Reconstruct the target path: /documents/doc-123/chunks
  const targetPath = `/${segments.join("/")}`;

  // Preserve query string
  const url = new URL(request.url);
  const queryString = url.search;

  const targetUrl = `${workerBaseUrl}${targetPath}${queryString}`;

  // Forward headers, injecting internal secret
  const headers = new Headers(request.headers);
  if (env.INTERNAL_API_SECRET) {
    headers.set("X-Internal-Secret", env.INTERNAL_API_SECRET);
  }
  // Remove host header to avoid issues
  headers.delete("host");

  // Forward the request
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    // @ts-expect-error -- duplex is required for streaming body but not in all type defs
    duplex: request.body ? "half" : undefined,
  });

  try {
    const response = await fetch(proxyRequest);

    // Clone response with CORS headers
    const corsHeaders = new Headers(response.headers);
    corsHeaders.set("Access-Control-Allow-Origin", "*");
    corsHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    corsHeaders.set("Access-Control-Allow-Headers", "Content-Type, X-Organization-Id, X-User-Id, X-User-Role");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: corsHeaders,
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: "Proxy error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
};
