import type { ApiResponse } from "@ai-foundry/types";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

const HEADERS = {
  "Content-Type": "application/json",
  "X-Internal-Secret":
    (import.meta.env["VITE_INTERNAL_SECRET"] as string | undefined) ??
    "dev-secret",
  "X-User-Id": "admin-001",
  "X-User-Role": "Analyst",
  "X-Organization-Id": "org-001",
};

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
  userId = "admin-001",
): Promise<ApiResponse<{ items: Notification[] }>> {
  const res = await fetch(
    `${API_BASE}/notifications?userId=${encodeURIComponent(userId)}`,
    { headers: HEADERS },
  );
  return res.json() as Promise<ApiResponse<{ items: Notification[] }>>;
}

export async function markNotificationRead(
  notificationId: string,
): Promise<ApiResponse<{ updated: boolean }>> {
  const res = await fetch(
    `${API_BASE}/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "PATCH", headers: HEADERS },
  );
  return res.json() as Promise<ApiResponse<{ updated: boolean }>>;
}
