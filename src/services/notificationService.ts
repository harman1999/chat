import type { AppNotification, ID } from "@/types";
import { notifications } from "@/data";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

export const notificationService = {
  async list(): Promise<AppNotification[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(notifications);
    return request<AppNotification[]>("/notifications");
  },

  async markRead(id: ID): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 50);
    return request<void>(`/notifications/${id}/read`, { method: "POST" });
  },

  async markAllRead(): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 80);
    return request<void>("/notifications/read-all", { method: "POST" });
  },
};
