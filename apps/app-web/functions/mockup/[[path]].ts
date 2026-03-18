/**
 * Proxy /mockup/* requests to the ai-foundry-mockup Pages project.
 * This allows accessing the mock-up site at ai-foundry.minu.best/mockup/
 */

const MOCKUP_ORIGIN = "https://ai-foundry-mockup.pages.dev";

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;

  const pathSegments = context.params["path"];
  const segments = Array.isArray(pathSegments) ? pathSegments : pathSegments ? [pathSegments] : [];
  const targetPath = segments.length > 0 ? `/${segments.join("/")}` : "/";

  const url = new URL(request.url);
  const targetUrl = `${MOCKUP_ORIGIN}${targetPath}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.body,
      // @ts-expect-error -- duplex required for streaming body
      duplex: request.body ? "half" : undefined,
    });

    const proxyHeaders = new Headers(response.headers);
    proxyHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: proxyHeaders,
    });
  } catch (err) {
    return Response.json(
      { error: "Mockup proxy error", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
};
