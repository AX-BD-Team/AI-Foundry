import { z } from "zod";

export const RoleSchema = z.enum([
  "Analyst",
  "Reviewer",
  "Developer",
  "Client",
  "Executive",
  "Admin",
]);

export type Role = z.infer<typeof RoleSchema>;

export const ResourceSchema = z.enum([
  "document",
  "extraction",
  "policy",
  "ontology",
  "skill",
  "audit",
  "governance",
  "analytics",
  "notification",
  "user",
]);

export type Resource = z.infer<typeof ResourceSchema>;

export const ActionSchema = z.enum([
  "create",
  "read",
  "update",
  "delete",
  "upload",
  "download",
  "approve",
  "reject",
  "execute",
]);

export type Action = z.infer<typeof ActionSchema>;

export const AuthContextSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  role: RoleSchema,
  organizationId: z.string(),
  sessionId: z.string(),
  issuedAt: z.number(),
  expiresAt: z.number(),
});

export type AuthContext = z.infer<typeof AuthContextSchema>;

// RBAC permission matrix
export const PERMISSIONS: Record<Role, Partial<Record<Resource, Action[]>>> = {
  Admin: {
    document: ["create", "read", "update", "delete", "upload", "download"],
    extraction: ["create", "read", "update", "delete", "execute"],
    policy: ["create", "read", "update", "delete", "approve", "reject"],
    ontology: ["create", "read", "update", "delete"],
    skill: ["create", "read", "update", "delete", "download"],
    audit: ["create", "read"],
    governance: ["create", "read", "update"],
    analytics: ["read"],
    notification: ["read", "update", "delete"],
    user: ["create", "read", "update", "delete"],
  },
  Analyst: {
    document: ["create", "read", "upload", "download"],
    extraction: ["read", "execute"],
    policy: ["read"],
    ontology: ["read"],
    skill: ["read", "download"],
    analytics: ["read"],
    notification: ["read", "update"],
  },
  Reviewer: {
    document: ["read"],
    extraction: ["read"],
    policy: ["read", "approve", "reject", "update"],
    ontology: ["read"],
    skill: ["read"],
    notification: ["read", "update"],
  },
  Developer: {
    document: ["read"],
    extraction: ["read"],
    policy: ["read"],
    ontology: ["read"],
    skill: ["read", "download"],
    notification: ["read", "update"],
  },
  Client: {
    document: ["read"],
    extraction: ["read"],
    policy: ["read"],
    skill: ["read"],
    audit: ["read"],
    analytics: ["read"],
    notification: ["read"],
  },
  Executive: {
    governance: ["read"],
    analytics: ["read"],
    skill: ["read"],
    audit: ["read"],
    notification: ["read"],
  },
};

export function hasPermission(
  role: Role,
  resource: Resource,
  action: Action,
): boolean {
  const allowed = PERMISSIONS[role]?.[resource];
  return allowed?.includes(action) ?? false;
}
