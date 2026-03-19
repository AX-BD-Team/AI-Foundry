/**
 * Proxy /mockup/* requests to the ai-foundry-mockup Pages project.
 * This allows accessing the mock-up site at ai-foundry.minu.best/mockup/
 *
 * For HTML responses, asset paths are rewritten to absolute URLs
 * pointing to the mockup origin so JS/CSS/images load correctly.
 */

const MOCKUP_ORIGIN = "https://ai-foundry-mockup-blt.pages.dev";

/**
 * Rewrite asset paths in HTML so they point to the mockup origin.
 * Vite produces paths like `/assets/main-abc123.js` — we prepend the origin.
 */
function rewriteAssetPaths(html: string): string {
  return html
    .replace(/(href|src|content)="\/(?!\/)/g, `$1="${MOCKUP_ORIGIN}/`)
    .replace(/(from |import\()["']\/assets\//g, `$1"${MOCKUP_ORIGIN}/assets/`);
}

function isHtmlResponse(response: Response): boolean {
  const ct = response.headers.get("content-type") ?? "";
  return ct.includes("text/html");
}

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;

  const pathSegments = context.params["path"];
  const segments = Array.isArray(pathSegments)
    ? pathSegments
    : pathSegments
      ? [pathSegments]
      : [];
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

    // For HTML responses, rewrite asset paths to absolute URLs
    if (isHtmlResponse(response)) {
      const html = await response.text();
      const rewritten = rewriteAssetPaths(html);
      proxyHeaders.delete("content-length");
      return new Response(rewritten, {
        status: response.status,
        statusText: response.statusText,
        headers: proxyHeaders,
      });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: proxyHeaders,
    });
  } catch (err) {
    return Response.json(
      {
        error: "Mockup proxy error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
};
