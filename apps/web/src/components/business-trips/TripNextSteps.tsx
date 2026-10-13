"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CalendarPlus, Phone } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";
import { todayVN, type PrefillStop } from "./types";

interface Step {
  id: string;
  companyName: string;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  nextAction: string;
  nextActionDue: string | null;
  nextActionOwner: { id: string; name: string } | null;
  trip: { visitDate: string; employee: { name: string } };
}

/** "Việc tiếp theo" sau các buổi gặp — việc chưa xong, hạn gần/trễ lên đầu; đánh dấu xong; mở form đăng ký lần gặp tiếp (điền sẵn khách). */
export function TripNextSteps({ isAdmin, onRegisterNext }: { isAdmin: boolean; onRegisterNext: (p: PrefillStop) => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["business-trips", "next-steps"],
    queryFn: async () => {
      const res = await fetch("/api/business-trips/next-steps");
      if (!res.ok) throw new Error("Không tải được việc tiếp theo");
      return res.json() as Promise<{ steps: Step[] }>;
    },
  });
  const today = todayVN();

  async function markDone(id: string) {
    const res = await fetch(`/api/business-trips/stops/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["business-trips"] });
    }
  }

  const steps = data?.steps ?? [];
  return (
    <div className="glass-card border border-white/10 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
      <table className="min-w-full text-xs">
        <thead className="bg-white/[0.04] text-muted-foreground border-b border-white/5">
          <tr>
            <th className="text-left font-medium px-4 py-2.5">Hạn</th>
            <th className="text-left font-medium px-4 py-2.5">Khách hàng</th>
            <th className="text-left font-medium px-4 py-2.5">Việc cần làm</th>
            <th className="text-left font-medium px-4 py-2.5">Phụ trách</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {isLoading && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                Đang tải...
              </td>
            </tr>
          )}
          {!isLoading && steps.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                Không có việc tiếp theo nào đang chờ.
              </td>
            </tr>
          )}
          {steps.map((s) => {
            const due = s.nextActionDue ? s.nextActionDue.slice(0, 10) : null;
            // nextActionDue lưu 00:00 giờ VN (= 17:00 UTC ngày trước) — đổi sang ngày VN trước khi so với hôm nay.
            const dueVN = s.nextActionDue ? new Date(new Date(s.nextActionDue).getTime() + 7 * 3600_000).toISOString().slice(0, 10) : due;
            const overdue = !!dueVN && dueVN < today;
            const dueToday = dueVN === today;
            return (
              <tr key={s.id} className="align-top hover:bg-white/[0.02]">
                <td className={cn("px-4 py-2.5 font-mono whitespace-nowrap", overdue ? "font-bold text-alert" : dueToday ? "font-semibold text-amber-300" : "text-ink2")}>
                  {s.nextActionDue ? formatDateVN(s.nextActionDue) : "—"}
                  {overdue && <span className="ml-1 text-[11px] font-normal">trễ hạn</span>}
                </td>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-ink">{s.companyName}</p>
                  {s.contactName && (
                    <p className="text-[11px] text-muted2">
                      {s.contactName}
                      {s.contactPhone && (
                        <a href={`tel:${s.contactPhone}`} className="ml-1.5 inline-flex items-center gap-0.5 text-amber-400 hover:underline">
                          <Phone className="h-3 w-3" />
                          {s.contactPhone}
                        </a>
                      )}
                    </p>
                  )}
                  <p className="text-[11px] text-muted2">Buổi gặp {formatDateVN(s.trip.visitDate)}</p>
                </td>
                <td className="px-4 py-2.5 text-ink2">{s.nextAction}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{s.nextActionOwner?.name ?? s.trip.employee.name}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    <button
                      onClick={() => markDone(s.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-400 hover:bg-emerald-500/20"
                      title="Đánh dấu đã xong"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Xong
                    </button>
                    <button
                      onClick={() => onRegisterNext({ companyName: s.companyName, address: s.address ?? "" })}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 font-medium text-ink hover:bg-white/10"
                      title="Đăng ký lần gặp tiếp theo với khách này"
                    >
                      <CalendarPlus className="h-3.5 w-3.5 text-amber-400" /> Đăng ký gặp tiếp
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {isAdmin && steps.length > 0 && <p className="border-t border-white/5 px-4 py-2 text-[11px] text-muted2">Quản trị viên thấy việc của cả phòng.</p>}
    </div>
  );
}
