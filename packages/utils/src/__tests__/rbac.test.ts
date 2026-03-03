import { describe, it, expect, vi } from "vitest";
import { extractRbacContext, checkPermission, logAudit } from "../rbac.js";

// ── extractRbacContext ──────────────────────────────────────────

describe("extractRbacContext", () => {
  function reqWith(headers: Record<string, string>): Request {
    return new Request("https://test.internal/api", { headers });
  }

  it("returns context when all headers are present with valid role", () => {
    const ctx = extractRbacContext(
      reqWith({
        "X-User-Id": "user-1",
        "X-User-Role": "Analyst",
        "X-Organization-Id": "org-1",
      }),
    );
    expect(ctx).toEqual({
      userId: "user-1",
      role: "Analyst",
      organizationId: "org-1",
    });
  });

  it("returns null when X-User-Id is missing", () => {
    const ctx = extractRbacContext(
      reqWith({ "X-User-Role": "Analyst", "X-Organization-Id": "org-1" }),
    );
    expect(ctx).toBeNull();
  });

  it("returns null when X-User-Role is missing", () => {
    const ctx = extractRbacContext(
      reqWith({ "X-User-Id": "user-1", "X-Organization-Id": "org-1" }),
    );
    expect(ctx).toBeNull();
  });

  it("returns null when X-Organization-Id is missing", () => {
    const ctx = extractRbacContext(
      reqWith({ "X-User-Id": "user-1", "X-User-Role": "Analyst" }),
    );
    expect(ctx).toBeNull();
  });

  it("returns null when role is invalid", () => {
    const ctx = extractRbacContext(
      reqWith({
        "X-User-Id": "user-1",
        "X-User-Role": "SuperAdmin",
        "X-Organization-Id": "org-1",
      }),
    );
    expect(ctx).toBeNull();
  });

  it("accepts all valid roles", () => {
    const roles = ["Analyst", "Reviewer", "Developer", "Client", "Executive", "Admin"];
    for (const role of roles) {
      const ctx = extractRbacContext(
        reqWith({
          "X-User-Id": "user-1",
          "X-User-Role": role,
          "X-Organization-Id": "org-1",
        }),
      );
      expect(ctx).not.toBeNull();
      expect(ctx?.role).toBe(role);
    }
  });

  it("returns null when no headers are present", () => {
    const ctx = extractRbacContext(new Request("https://test.internal/api"));
    expect(ctx).toBeNull();
  });
});

// ── checkPermission ─────────────────────────────────────────────

describe("checkPermission", () => {
  function mockEnv(response: { ok: boolean; body: unknown }) {
    return {
      SECURITY: {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify(response.body), {
            status: response.ok ? 200 : 500,
          }),
        ),
      } as unknown as Fetcher,
      INTERNAL_API_SECRET: "test-secret",
    };
  }

  it("returns null (allowed) when permission check passes", async () => {
    const env = mockEnv({ ok: true, body: { success: true, data: { allowed: true } } });
    const result = await checkPermission(env, "Analyst", "document", "read");
    expect(result).toBeNull();
  });

  it("returns 403 when permission is denied", async () => {
    const env = mockEnv({ ok: true, body: { success: true, data: { allowed: false } } });
    const result = await checkPermission(env, "Client", "document", "delete");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("returns 403 when security service returns error", async () => {
    const env = mockEnv({ ok: false, body: {} });
    const result = await checkPermission(env, "Analyst", "document", "read");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("returns 403 when response body is unsuccessful", async () => {
    const env = mockEnv({ ok: true, body: { success: false } });
    const result = await checkPermission(env, "Analyst", "document", "read");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("sends correct request to security service", async () => {
    const env = mockEnv({ ok: true, body: { success: true, data: { allowed: true } } });
    await checkPermission(env, "Reviewer", "policy", "approve");

    const fetchMock = env.SECURITY.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://svc-security/rbac/check");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual(
      expect.objectContaining({ "X-Internal-Secret": "test-secret" }),
    );
    const body = JSON.parse(opts.body as string) as { role: string; resource: string; action: string };
    expect(body).toEqual({ role: "Reviewer", resource: "policy", action: "approve" });
  });
});

// ── logAudit ────────────────────────────────────────────────────

describe("logAudit", () => {
  it("sends audit entry to security service", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    const env = {
      SECURITY: { fetch: fetchMock } as unknown as Fetcher,
      INTERNAL_API_SECRET: "test-secret",
    };

    await logAudit(env, {
      userId: "user-1",
      organizationId: "org-1",
      action: "upload",
      resource: "document",
      resourceId: "doc-123",
      details: { fileName: "test.pdf" },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://svc-security/audit");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      userId: "user-1",
      organizationId: "org-1",
      action: "upload",
      resource: "document",
      resourceId: "doc-123",
      details: { fileName: "test.pdf" },
    });
  });

  it("sends without optional fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    const env = {
      SECURITY: { fetch: fetchMock } as unknown as Fetcher,
      INTERNAL_API_SECRET: "test-secret",
    };

    await logAudit(env, {
      userId: "user-1",
      organizationId: "org-1",
      action: "read",
      resource: "analytics",
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body["resourceId"]).toBeUndefined();
    expect(body["details"]).toBeUndefined();
  });
});
