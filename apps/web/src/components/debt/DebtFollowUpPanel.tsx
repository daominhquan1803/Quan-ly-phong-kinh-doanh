"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, BellRing } from "lucide-react";
import { cn, formatCurrencyVND, formatDateVN, toDateInputValueVN } from "@/lib/utils";

interface FollowUpRow {
  employeeId: string;
  employeeName: string;
  plannedAmount: number;
  plannedCount: number;
  slippedAmount: number;
  slippedCount: number;
  total: number;
  collected: number;
  remaining: number;
}
interface FollowUpInvoice {
  id: string;
  invoiceNumber: string | null;
  customerCode: string;
  customerName: string;
  employeeName: string;
  expectedPaymentDate: string;
  kind: "planned" | "slipped";
  slippedWeeks: number;
  openAtStart: number;
  collected: number;
  remaining: number;
}
interface FollowUpResponse {
  weekStart: string;
  weekEnd: string;
  isCurrentWeek: boolean;
  rows: FollowUpRow[];
  totals: Omit<FollowUpRow, "employeeId" | "employeeName">;
  invoices: FollowUpInvoice[];
}

type Filter = "all" | "planned" | "slipped";
const VN = "T00:00:00+07:00";

function shiftWeek(date: string, weeks: number): string {
  return toDateInputValueVN(new Date(new Date(`${date}${VN}`).getTime() + weeks * 7 * 86400000));
}

/**
 * "Cần thu tuần này" — nhắc nhân viên thu tiếp: khoản trượt kế hoạch các tuần trước tự rơi vào đầu tuần
 * này (chỉ tính khi hiển thị, không đổi ngày dự kiến) — bảng "Kế hoạch thu tháng" phía trên vẫn đánh giá
 * đúng kế hoạch ban đầu. Cách tính ở lib/debt-followup.ts.
 */
export function DebtFollowUpPanel({ isAdmin, employeeId }: { isAdmin: boolean; employeeId: string }) {
  const today = toDateInputValueVN(new Date());
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<Filter>("all");

  // queryKey bắt đầu bằng "debt-summary" để mọi chỗ đã invalidate ["debt-summary"] (đổi ngày dự kiến, nhập tiền về...) tự làm mới bảng này.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["debt-summary", "followup", employeeId, date],
    queryFn: async () => {
      const params = new URLSearchParams({ date });
      if (employeeId) params.set("employeeId", employeeId);
      const res = await fetch(`/api/debt/followup?${params.toString()}`);
      if (!res.ok) throw new Error("Không tải được danh sách cần thu");
      return (await res.json()) as FollowUpResponse;
    },
  });

  const shown = (data?.invoices ?? []).filter((i) => filter === "all" || i.kind === filter);
  const t = data?.totals;

  return (
    <div className="glass-card border border-amber-500/20 p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 pb-3">
        <div>
          <p className="font-semibold text-ink text-sm flex items-center gap-2">
            <BellRing className="h-4 w-4 text-amber-400" />
            {data?.isCurrentWeek === false ? "Cần thu tuần" : "Cần thu tuần này"}
            {data && (
              <span className="font-mono text-xs text-muted2 font-normal">
                {formatDateVN(data.weekStart)} – {formatDateVN(data.weekEnd)}
              </span>
            )}
          </p>
          <p className="text-xs text-muted2 mt-0.5">
            Kế hoạch tuần + khoản trượt từ các tuần trước (tự chuyển sang đầu tuần để nhắc thu tiếp). Khác bảng Kế hoạch thu ở trên — bảng đó giữ nguyên để đánh giá kế hoạch.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDate((d) => shiftWeek(d, -1))}
            aria-label="Tuần trước"
            className="rounded-lg border border-white/10 p-1.5 hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Chọn tuần xem (ngày bất kỳ trong tuần)"
            className="text-xs bg-card text-ink rounded-lg border border-white/10 py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
          />
          <button
            type="button"
            onClick={() => setDate((d) => (shiftWeek(d, 1) > today ? d : shiftWeek(d, 1)))}
            disabled={data?.isCurrentWeek}
            aria-label="Tuần sau"
            className="rounded-lg border border-white/10 p-1.5 hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {date !== today && (
            <button type="button" onClick={() => setDate(today)} className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2">
              Tuần này
            </button>
          )}
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
      {isError && <p className="text-sm text-alert">Không tải được danh sách cần thu.</p>}

      {t && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Tile label="Kế hoạch tuần" value={t.plannedAmount} sub={`${t.plannedCount} hoá đơn`} />
            <Tile label="Trượt từ trước" value={t.slippedAmount} sub={`${t.slippedCount} hoá đơn`} tone={t.slippedAmount > 0 ? "alert" : "muted"} />
            <Tile label="Tổng cần thu" value={t.total} sub="đầu tuần" />
            <Tile label="Đã thu trong tuần" value={t.collected} tone="good" />
            <Tile label="Còn phải thu" value={t.remaining} tone={t.remaining > 0 ? "alert" : "good"} />
          </div>

          {isAdmin && data.rows.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-black/40 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-white/[0.04] text-muted-foreground border-b border-white/5">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Nhân viên</th>
                    <th className="text-right font-medium px-4 py-2.5">Kế hoạch tuần</th>
                    <th className="text-right font-medium px-4 py-2.5">Trượt từ trước</th>
                    <th className="text-right font-medium px-4 py-2.5">Tổng cần thu</th>
                    <th className="text-right font-medium px-4 py-2.5">Đã thu</th>
                    <th className="text-right font-medium px-4 py-2.5">Còn phải thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.rows.map((r) => (
                    <tr key={r.employeeId || "none"} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2 text-ink font-medium">{r.employeeName}</td>
                      <td className="px-4 py-2 text-right font-mono text-ink">{formatCurrencyVND(r.plannedAmount)}</td>
                      <td className={cn("px-4 py-2 text-right font-mono", r.slippedAmount > 0 ? "text-alert font-semibold" : "text-muted2")}>
                        {formatCurrencyVND(r.slippedAmount)}
                        {r.slippedCount > 0 && <span className="text-muted2 font-normal"> ({r.slippedCount})</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-ink font-medium">{formatCurrencyVND(r.total)}</td>
                      <td className="px-4 py-2 text-right font-mono text-emerald-400">{formatCurrencyVND(r.collected)}</td>
                      <td className={cn("px-4 py-2 text-right font-mono font-bold", r.remaining > 0 ? "text-alert" : "text-emerald-400")}>
                        {formatCurrencyVND(r.remaining)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(
              [
                ["all", `Tất cả (${data.invoices.length})`],
                ["slipped", `Trượt (${t.slippedCount})`],
                ["planned", `Kế hoạch tuần (${t.plannedCount})`],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 transition-colors",
                  filter === k ? "border-amber-500/50 bg-amber-500/15 text-amber-300" : "border-white/10 text-muted2 hover:bg-white/10"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-white/5 bg-black/40 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-white/[0.04] text-muted-foreground border-b border-white/5">
                <tr>
                  <th className="text-left font-medium px-3.5 py-2.5">Khách hàng</th>
                  <th className="text-left font-medium px-3.5 py-2.5">Số hoá đơn</th>
                  {isAdmin && <th className="text-left font-medium px-3.5 py-2.5">NVKD</th>}
                  <th className="text-left font-medium px-3.5 py-2.5">Ngày dự kiến</th>
                  <th className="text-left font-medium px-3.5 py-2.5">Tình trạng</th>
                  <th className="text-right font-medium px-3.5 py-2.5">Cần thu</th>
                  <th className="text-right font-medium px-3.5 py-2.5">Đã thu</th>
                  <th className="text-right font-medium px-3.5 py-2.5">Còn phải thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} className="px-3.5 py-4 text-center text-muted-foreground">
                      Không có khoản nào cần thu.
                    </td>
                  </tr>
                )}
                {shown.map((i) => (
                  <tr key={i.id} className="hover:bg-white/[0.02]">
                    <td className="px-3.5 py-2 text-ink font-medium whitespace-nowrap" title={i.customerName}>{i.customerCode}</td>
                    <td className="px-3.5 py-2 font-mono text-amber-300/90">{i.invoiceNumber ?? "—"}</td>
                    {isAdmin && <td className="px-3.5 py-2 text-muted2">{i.employeeName}</td>}
                    <td className="px-3.5 py-2 font-mono text-muted2">{formatDateVN(i.expectedPaymentDate)}</td>
                    <td className="px-3.5 py-2 whitespace-nowrap">
                      {i.kind === "slipped" ? (
                        <span
                          className={cn(
                            "rounded-md border px-2 py-0.5 font-medium",
                            i.slippedWeeks >= 3 ? "border-brandRed-500/50 bg-brandRed-500/15 text-alert" : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                          )}
                        >
                          Trượt {i.slippedWeeks} tuần
                        </span>
                      ) : (
                        <span className="text-muted2">Kế hoạch tuần</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono text-ink">{formatCurrencyVND(i.openAtStart)}</td>
                    <td className="px-3.5 py-2 text-right font-mono text-emerald-400">{i.collected > 0 ? formatCurrencyVND(i.collected) : "—"}</td>
                    <td className={cn("px-3.5 py-2 text-right font-mono font-bold", i.remaining > 0 ? "text-alert" : "text-emerald-400")}>
                      {formatCurrencyVND(i.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone = "ink" }: { label: string; value: number; sub?: string; tone?: "ink" | "alert" | "good" | "muted" }) {
  const color = { ink: "text-ink", alert: "text-alert", good: "text-emerald-400", muted: "text-muted2" }[tone];
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
      <p className="text-xs text-muted2">{label}</p>
      <p className={cn("text-sm font-bold font-mono mt-1.5", color)}>{formatCurrencyVND(value)}</p>
      {sub && <p className="text-[11px] text-muted2 mt-0.5">{sub}</p>}
    </div>
  );
}
