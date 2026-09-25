"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { notificationService } from "@/services";
import type { AppNotification, ID } from "@/types";

/**
 * Notification feed with optimistic read state — the panel must respond
 * instantly, and a failed write is not worth blocking the UI for.
 */
export function useNotifications() {
  const queryClient = useQueryClient();
  const queryKey = ["notifications"];

  const query = useQuery<AppNotification[]>({
    queryKey,
    queryFn: () => notificationService.list(),
    staleTime: 30_000,
  });

  const patch = useCallback(
    (updater: (items: AppNotification[]) => AppNotification[]) => {
      queryClient.setQueryData<AppNotification[]>(queryKey, (items) => (items ? updater(items) : items));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient],
  );

  const markRead = useMutation({
    mutationFn: (id: ID) => notificationService.markRead(id),
    onMutate: (id) => {
      patch((items) => items.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onMutate: () => {
      patch((items) => items.map((item) => ({ ...item, isRead: true })));
    },
  });

  const unreadCount = query.data?.filter((item) => !item.isRead).length ?? 0;

  return {
    ...query,
    unreadCount,
    markRead: markRead.mutate,
    markAllRead: markAllRead.mutate,
  };
}
