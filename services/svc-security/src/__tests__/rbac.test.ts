import { describe, it, expect } from "vitest";
import { handleCheckPermission, handleGetRolePermissions } from "../routes/rbac.js";
import { PERMISSIONS } from "@ai-foundry/types";

// ── Helpers ──────────────────────────────────────────────────────

function createCheckRequest(body: unknown): Request {
  return new Request("https://test.internal/rbac/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createPermissionsRequest(body: unknown): Request {
  return new Request("https://test.internal/rbac/permissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── handleCheckPermission ───────────────────────────────────────

describe("handleCheckPermission", () => {
  // ── Validation ────────────────────────────────────────────────

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://test.internal/rbac/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{",
    });
    const res = await handleCheckPermission(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("Invalid JSON body");
  });

  it("returns 400 when role is missing", async () => {
    const req = createCheckRequest({ resource: "document", action: "read" });
    const res = await handleCheckPermission(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when resource is missing", async () => {
    const req = createCheckRequest({ role: "Analyst", action: "read" });
    const res = await handleCheckPermission(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when action is missing", async () => {
    const req = createCheckRequest({ role: "Analyst", resource: "document" });
    const res = await handleCheckPermission(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid role value", async () => {
    const req = createCheckRequest({ role: "SuperAdmin", resource: "document", action: "read" });
    const res = await handleCheckPermission(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid resource value", async () => {
    const req = createCheckRequest({ role: "Analyst", resource: "secret", action: "read" });
    const res = await handleCheckPermission(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid action value", async () => {
    const req = createCheckRequest({ role: "Analyst", resource: "document", action: "purge" });
    const res = await handleCheckPermission(req);
    expect(res.status).toBe(400);
  });

  // ── Admin role ────────────────────────────────────────────────

  it("Admin can read document", async () => {
    const req = createCheckRequest({ role: "Admin", resource: "document", action: "read" });
    const res = await handleCheckPermission(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Admin can delete document", async () => {
    const req = createCheckRequest({ role: "Admin", resource: "document", action: "delete" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Admin can approve policy", async () => {
    const req = createCheckRequest({ role: "Admin", resource: "policy", action: "approve" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Admin can manage users", async () => {
    const req = createCheckRequest({ role: "Admin", resource: "user", action: "create" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  // ── Analyst role ──────────────────────────────────────────────

  it("Analyst can upload document", async () => {
    const req = createCheckRequest({ role: "Analyst", resource: "document", action: "upload" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Analyst can read extraction", async () => {
    const req = createCheckRequest({ role: "Analyst", resource: "extraction", action: "read" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Analyst cannot delete document", async () => {
    const req = createCheckRequest({ role: "Analyst", resource: "document", action: "delete" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(false);
  });

  it("Analyst cannot approve policy", async () => {
    const req = createCheckRequest({ role: "Analyst", resource: "policy", action: "approve" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(false);
  });

  it("Analyst can read audit (demo: universal read)", async () => {
    const req = createCheckRequest({ role: "Analyst", resource: "audit", action: "read" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  // ── Reviewer role ─────────────────────────────────────────────

  it("Reviewer can approve policy", async () => {
    const req = createCheckRequest({ role: "Reviewer", resource: "policy", action: "approve" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Reviewer can reject policy", async () => {
    const req = createCheckRequest({ role: "Reviewer", resource: "policy", action: "reject" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Reviewer cannot upload document", async () => {
    const req = createCheckRequest({ role: "Reviewer", resource: "document", action: "upload" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(false);
  });

  it("Reviewer cannot download skill", async () => {
    const req = createCheckRequest({ role: "Reviewer", resource: "skill", action: "download" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(false);
  });

  // ── Developer role ────────────────────────────────────────────

  it("Developer can download skill", async () => {
    const req = createCheckRequest({ role: "Developer", resource: "skill", action: "download" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Developer can read extraction", async () => {
    const req = createCheckRequest({ role: "Developer", resource: "extraction", action: "read" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Developer cannot create document", async () => {
    const req = createCheckRequest({ role: "Developer", resource: "document", action: "create" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(false);
  });

  it("Developer cannot approve policy", async () => {
    const req = createCheckRequest({ role: "Developer", resource: "policy", action: "approve" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(false);
  });

  // ── Client role ───────────────────────────────────────────────

  it("Client can read document", async () => {
    const req = createCheckRequest({ role: "Client", resource: "document", action: "read" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Client can read audit", async () => {
    const req = createCheckRequest({ role: "Client", resource: "audit", action: "read" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Client cannot create anything", async () => {
    const req = createCheckRequest({ role: "Client", resource: "document", action: "create" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(false);
  });

  it("Client cannot approve policy", async () => {
    const req = createCheckRequest({ role: "Client", resource: "policy", action: "approve" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(false);
  });

  // ── Executive role ────────────────────────────────────────────

  it("Executive can read analytics", async () => {
    const req = createCheckRequest({ role: "Executive", resource: "analytics", action: "read" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Executive can read governance", async () => {
    const req = createCheckRequest({ role: "Executive", resource: "governance", action: "read" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Executive can read audit", async () => {
    const req = createCheckRequest({ role: "Executive", resource: "audit", action: "read" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it("Executive cannot create document", async () => {
    const req = createCheckRequest({ role: "Executive", resource: "document", action: "create" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(false);
  });

  it("Executive can read document (dashboard access)", async () => {
    const req = createCheckRequest({ role: "Executive", resource: "document", action: "read" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  // ── Response shape ────────────────────────────────────────────

  it("returns role, resource, action in the response", async () => {
    const req = createCheckRequest({ role: "Analyst", resource: "document", action: "read" });
    const res = await handleCheckPermission(req);
    const body = (await res.json()) as {
      data: { allowed: boolean; role: string; resource: string; action: string };
    };
    expect(body.data.role).toBe("Analyst");
    expect(body.data.resource).toBe("document");
    expect(body.data.action).toBe("read");
  });
});

// ── handleGetRolePermissions ────────────────────────────────────

describe("handleGetRolePermissions", () => {
  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://test.internal/rbac/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid{",
    });
    const res = await handleGetRolePermissions(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when role is missing", async () => {
    const req = createPermissionsRequest({});
    const res = await handleGetRolePermissions(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid role value", async () => {
    const req = createPermissionsRequest({ role: "Hacker" });
    const res = await handleGetRolePermissions(req);
    expect(res.status).toBe(400);
  });

  it("returns Admin permissions", async () => {
    const req = createPermissionsRequest({ role: "Admin" });
    const res = await handleGetRolePermissions(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { role: string; permissions: Record<string, string[]> };
    };
    expect(body.data.role).toBe("Admin");
    expect(body.data.permissions).toEqual(PERMISSIONS.Admin);
  });

  it("returns Analyst permissions", async () => {
    const req = createPermissionsRequest({ role: "Analyst" });
    const res = await handleGetRolePermissions(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { role: string; permissions: Record<string, string[]> };
    };
    expect(body.data.role).toBe("Analyst");
    expect(body.data.permissions).toEqual(PERMISSIONS.Analyst);
  });

  it("returns Reviewer permissions", async () => {
    const req = createPermissionsRequest({ role: "Reviewer" });
    const res = await handleGetRolePermissions(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { role: string; permissions: Record<string, string[]> };
    };
    expect(body.data.permissions).toEqual(PERMISSIONS.Reviewer);
  });

  it("returns Developer permissions", async () => {
    const req = createPermissionsRequest({ role: "Developer" });
    const res = await handleGetRolePermissions(req);
    const body = (await res.json()) as {
      data: { permissions: Record<string, string[]> };
    };
    expect(body.data.permissions).toEqual(PERMISSIONS.Developer);
  });

  it("returns Client permissions", async () => {
    const req = createPermissionsRequest({ role: "Client" });
    const res = await handleGetRolePermissions(req);
    const body = (await res.json()) as {
      data: { permissions: Record<string, string[]> };
    };
    expect(body.data.permissions).toEqual(PERMISSIONS.Client);
  });

  it("returns Executive permissions", async () => {
    const req = createPermissionsRequest({ role: "Executive" });
    const res = await handleGetRolePermissions(req);
    const body = (await res.json()) as {
      data: { permissions: Record<string, string[]> };
    };
    expect(body.data.permissions).toEqual(PERMISSIONS.Executive);
  });
});
