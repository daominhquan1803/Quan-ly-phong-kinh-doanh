"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";

export interface PlanRow {
  id: string;
  customerCode: string;
  customerName: string;
  employeeId: string;
  tier: "A" | "B" | "C" | "NGU";
  cycle: number;
  value12: number;
  lastOrderAt: string | null;
  lastTouch: { at: string; kind: "CARE" | "VISIT" | "ORDER" } | null;
  overdueDays: number;
}
export interface PlanResponse {
  scope: "TEAM" | "SELF";
  cycles: Record<string, number>;
  employees: { id: string; name: string }[];
  customers: PlanRow[];
}

export const TIER_STYLE: Record<PlanRow["tier"], string> = {
  A: "border-red-500/50 text-alert",
  B: "border-amber-500/50 text-amber-400",
  C: "border-sky-500/40 text-sky-300",
  NGU: "border-gray-200/30 text-muted-foreground",
};
export const TIER_TEXT: Record<PlanRow["tier"], string> = { A: "A", B: "B", C: "C", NGU: "Ngủ" };
const KIND_TEXT = { CARE: "ghi chăm sóc", VISIT: "đi gặp", ORDER: "có đơn" } as const;

export function usePlan() {
  return useQuery({
    queryKey: ["care-plan"],
    queryFn: async () => {
      const res = await fetch("/api/customer-care/plan");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không tải được lịch chăm sóc");
      return json as PlanResponse;
    },
  });
}

/** "Hôm nay cần chạm": khách quá hạn + đến hạn hôm nay theo chu kỳ hạng (A 7 / B 14 / C 30 / Ngủ 60 ngày). */
export function DuePlan({ onSelect }: { onSelect: (customerId: string) => void }) {
  const { data, isLoading, error } = usePlan();
  const [emp, setEmp] = useState("");
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const order = { A: 0, B: 1, C: 2, NGU: 3 };
    return (data?.customers ?? [])
      .filter((c) => c.overdueDays >= 0 && (!emp || c.employeeId === emp))
      .sort((a, b) => order[a.tier] - order[b.tier] || b.overdueDays - a.overdueDays || b.value12 - a.value12);
  }, [data, emp]);
  const upcoming = (data?.customers ?? []).filter((c) => c.overdueDays >= -2 && c.overdueDays < 0 && (!emp || c.employeeId === emp)).length;
  const nameOf = new Map((data?.employees ?? []).map((e) => [e.id, e.name]));

  if (isLoading) return <div className="rounded-2xl border border-gray-200/30 p-4 text-sm text-muted-foreground">Đang tải lịch chăm sóc...</div>;
  if (error) return <div className="rounded-2xl border border-gray-200/30 p-4 text-sm text-alert">{(error as Error).message}</div>;
  if (!data) return null;
  const shown = showAll ? rows : rows.slice(0, 12);

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-400">
          <CalendarCheck className="h-4 w-4" /> Hôm nay cần chạm ({rows.length})
        </p>
        {data.scope === "TEAM" && data.employees.length > 1 && (
          <select value={emp} onChange={(e) => setEmp(e.target.value)} className="rounded-lg border border-gray-200/40 bg-card px-2 py-1 text-xs text-ink" aria-label="Lọc theo nhân viên">
            <option value="">Tất cả nhân viên</option>
            {data.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Chu kỳ: A 7 ngày · B 14 · C 30 · Ngủ 60. Đi gặp (app công tác) và đơn mới tự tính là đã chạm.
        {upcoming > 0 && ` ${upcoming} khách đến hạn trong 2 ngày tới.`}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-emerald-300">Không có khách đến hạn. Tốt!</p>
      ) : (
        <div className="divide-y divide-gray-200/20">
          {shown.map((c) => (
            <button key={c.id} onClick={() => onSelect(c.id)} className="flex w-full items-center justify-between gap-2 py-1.5 text-left hover:bg-white/5">
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn("shrink-0 rounded border px-1.5 text-[11px] font-bold", TIER_STYLE[c.tier])}>{TIER_TEXT[c.tier]}</span>
                <span className="shrink-0 font-mono text-sm font-semibold text-ink" title={c.customerName}>
                  {c.customerCode}
                </span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">{c.customerName}</span>
              </span>
              <span className="shrink-0 text-right text-[11px]">
                <span className={c.overdueDays > 0 ? "text-alert" : "text-amber-400"}>{c.overdueDays > 0 ? `trễ ${c.overdueDays} ngày` : "hạn hôm nay"}</span>
                <span className="block text-muted-foreground">
                  {data.scope === "TEAM" ? `${nameOf.get(c.employeeId) ?? ""} · ` : ""}
                  {c.lastTouch ? `${KIND_TEXT[c.lastTouch.kind]} ${formatDateVN(c.lastTouch.at)}` : "chưa chạm"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {rows.length > 12 && (
        <button onClick={() => setShowAll(!showAll)} className="mt-2 text-xs text-amber-400 hover:underline">
          {showAll ? "Thu gọn" : `Xem thêm ${rows.length - 12} khách`}
        </button>
      )}
    </div>
  );
}
