/**
 * Pages Functions Middleware
 *
 * Handles CORS preflight (OPTIONS) for all /api/* requests.
 */
export const onRequest: PagesFunction = async (context) => {
  // Handle CORS preflight
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, X-Organization-Id, X-User-Id, X-User-Role, X-Internal-Secret",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  return context.next();
};
