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

// All resources — used to grant universal read access in demo mode
const ALL_RESOURCES: Resource[] = [
  "document", "extraction", "policy", "ontology", "skill",
  "audit", "governance", "analytics", "notification", "user",
];

const ALL_READ: Partial<Record<Resource, Action[]>> = Object.fromEntries(
  ALL_RESOURCES.map((r) => [r, ["read"] as Action[]]),
);

// RBAC permission matrix
// NOTE: All roles have universal read access for demo/pilot.
//       Role-specific write permissions are layered on top.
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
    ...ALL_READ,
    document: ["create", "read", "update", "upload", "download"],
    extraction: ["read", "execute"],
    notification: ["read", "update"],
  },
  Reviewer: {
    ...ALL_READ,
    policy: ["read", "approve", "reject", "update"],
    notification: ["read", "update"],
  },
  Developer: {
    ...ALL_READ,
    skill: ["read", "download"],
    notification: ["read", "update"],
  },
  Client: {
    ...ALL_READ,
  },
  Executive: {
    ...ALL_READ,
    skill: ["read", "download"],
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
