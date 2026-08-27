"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationRow {
  id: string;
  type: "WEEK_PLAN_REMINDER" | "KPI_REMINDER";
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Không tải được thông báo");
      return res.json() as Promise<{ notifications: NotificationRow[]; unreadCount: number }>;
    },
    // Tự làm mới định kỳ để chuông cập nhật số chưa đọc mà không cần tải lại trang.
    refetchInterval: 60_000,
  });

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-muted-foreground hover:bg-gray-50 hover:text-ink"
        aria-label="Thông báo"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brandRed-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-lg border border-gray-200 bg-card shadow-card">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
              <p className="font-medium text-sm text-ink">Thông báo</p>
              {unreadCount > 0 && (
                <button onClick={() => markRead("all")} className="text-xs text-amber-500 hover:underline">
                  Đánh dấu đã đọc hết
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
              {!data || data.notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">Chưa có thông báo nào.</p>
              ) : (
                data.notifications.map((n) => {
                  const body = (
                    <div
                      className={cn("px-4 py-3 hover:bg-gray-50 cursor-pointer", !n.readAt && "bg-amber-500/5")}
                      onClick={() => {
                        if (!n.readAt) markRead(n.id);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />}
                        <div className={cn(!n.readAt ? "" : "pl-3.5")}>
                          <p className="text-sm font-medium text-ink">{n.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                          <p className="text-[11px] text-muted2 mt-1">{timeAgo(n.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  );
                  return n.link ? (
                    <Link key={n.id} href={n.link}>
                      {body}
                    </Link>
                  ) : (
                    <div key={n.id}>{body}</div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
