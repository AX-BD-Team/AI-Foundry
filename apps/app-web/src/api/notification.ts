import type { ApiResponse } from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

const USER_ID = "admin-001";
const USER_ROLE = "Analyst";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({
    organizationId,
    userId: USER_ID,
    userRole: USER_ROLE,
    contentType: "application/json",
  });
}

export interface Notification {
  notification_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export async function fetchNotifications(
  organizationId: string,
  userId = "admin-001",
): Promise<ApiResponse<{ items: Notification[] }>> {
  const res = await fetch(
    `${API_BASE}/notifications?userId=${encodeURIComponent(userId)}`,
    { headers: headers(organizationId) },
  );
  return res.json() as Promise<ApiResponse<{ items: Notification[] }>>;
}

export async function markNotificationRead(
  organizationId: string,
  notificationId: string,
): Promise<ApiResponse<{ updated: boolean }>> {
  const res = await fetch(
    `${API_BASE}/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "PATCH", headers: headers(organizationId) },
  );
  return res.json() as Promise<ApiResponse<{ updated: boolean }>>;
}
