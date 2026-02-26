import { z } from "zod";
import { RoleSchema, ResourceSchema, ActionSchema, hasPermission } from "@ai-foundry/types";
import { ok, badRequest } from "@ai-foundry/utils";

const CheckPermissionSchema = z.object({
  role: RoleSchema,
  resource: ResourceSchema,
  action: ActionSchema,
});

export async function handleCheckPermission(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = CheckPermissionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid request", parsed.error.flatten());
  }

  const { role, resource, action } = parsed.data;
  const allowed = hasPermission(role, resource, action);

  return ok({ allowed, role, resource, action });
}

const GetRolePermissionsSchema = z.object({
  role: RoleSchema,
});

export async function handleGetRolePermissions(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = GetRolePermissionsSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid request", parsed.error.flatten());
  }

  const { role } = parsed.data;
  const { PERMISSIONS } = await import("@ai-foundry/types");
  const permissions = PERMISSIONS[role] ?? {};

  return ok({ role, permissions });
}
