const API_SECRET =
  (import.meta.env["VITE_INTERNAL_SECRET"] as string | undefined) ?? "dev-secret";

export function buildHeaders(opts: {
  organizationId: string;
  userId: string;
  userRole: string;
  contentType?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Internal-Secret": API_SECRET,
    "X-User-Id": opts.userId,
    "X-User-Role": opts.userRole,
    "X-Organization-Id": opts.organizationId,
  };
  if (opts.contentType !== undefined) {
    headers["Content-Type"] = opts.contentType;
  }
  return headers;
}
