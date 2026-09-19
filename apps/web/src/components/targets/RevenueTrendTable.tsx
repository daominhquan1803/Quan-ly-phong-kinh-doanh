"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrencyVND, cn } from "@/lib/utils";

interface MonthMeta {
  year: number;
  month: number;
  label: string;
}
interface TrendRow {
  employeeId: string;
  employeeName: string;
  values: number[];
  ytdActual: number;
  ytdTarget: number;
  ytdCompletionPct: number | null;
}
interface TrendResponse {
  months: MonthMeta[];
  rows: TrendRow[];
  totals: number[];
  ytdTotalActual: number;
  ytdTotalTarget: number;
  ytdTotalCompletionPct: number | null;
}

function completionColor(pct: number | null): string {
  if (pct == null) return "text-ink";
  if (pct >= 100) return "text-success-600";
  if (pct < 60) return "text-brandRed-600";
  return "text-ink";
}

/** Bảng "Doanh số đi hàng từ đầu năm" — doanh số đã giao thực tế theo từng tháng (Tháng 1 -> tháng
 * đang xem), theo từng nhân viên, kèm cột luỹ kế + % hoàn thành so với tổng chỉ tiêu luỹ kế cùng
 * khoảng — cho thấy cả nhịp độ từng tháng lẫn tiến độ chung cả năm tới thời điểm hiện tại. */
export function RevenueTrendTable() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [uptoMonth, setUptoMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["targets-revenue-trend", year, uptoMonth],
    queryFn: async () => {
      const res = await fetch(`/api/targets/revenue-trend?year=${year}&month=${uptoMonth}`);
      if (!res.ok) throw new Error("Không tải được bảng doanh số đi hàng từ đầu năm");
      return res.json() as Promise<TrendResponse>;
    },
  });
  const monthCount = data?.months.length ?? uptoMonth;
  const colSpanCount = monthCount + 4; // Nhân viên + N tháng + Luỹ kế + Chỉ tiêu luỹ kế + % hoàn thành

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-ink text-sm tracking-wide">Doanh số đi hàng từ đầu năm</h2>
          <p className="text-xs text-muted2 mt-0.5">
            Doanh số đã giao thực tế theo từng tháng (Tháng 1 → tháng đang xem), theo từng nhân viên.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted2">Đến tháng</span>
          <select
            value={uptoMonth}
            onChange={(e) => setUptoMonth(Number(e.target.value))}
            className="text-xs font-medium bg-card text-ink rounded-xl border border-white/10 py-2 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                Tháng {m}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="text-xs font-medium bg-card text-ink rounded-xl border border-white/10 py-2 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-sm"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                Năm {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="glass-card border border-white/10 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-white/[0.04] text-muted-foreground border-b border-white/5 backdrop-blur-md">
              <tr>
                <th className="text-left font-medium px-4 py-3 sticky left-0 bg-brandNavy-900/90 backdrop-blur-md z-10 border-r border-white/5">
                  Nhân viên
                </th>
                {data?.months.map((m, idx) => (
                  <th key={m.label} className="text-right font-medium px-4 py-3 whitespace-nowrap">
                    {m.label}
                    {idx === monthCount - 1 && <span className="block text-[10px] text-amber-400 font-normal tracking-wide">(gần nhất)</span>}
                  </th>
                ))}
                <th className="text-right font-medium px-4 py-3 whitespace-nowrap border-l border-white/10 text-ink">Luỹ kế</th>
                <th className="text-right font-medium px-4 py-3 whitespace-nowrap">Chỉ tiêu luỹ kế</th>
                <th className="text-right font-medium px-4 py-3 whitespace-nowrap">% Hoàn thành</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading && (
                <tr>
                  <td colSpan={colSpanCount} className="px-4 py-8 text-center text-muted-foreground">
                    <div className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                      Đang tải số liệu doanh số...
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && (data?.rows.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={colSpanCount} className="px-4 py-8 text-center text-muted-foreground">
                    Chưa có dữ liệu trong khoảng này.
                  </td>
                </tr>
              )}
              {data?.rows.map((r) => (
                <tr key={r.employeeId} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 font-medium text-ink sticky left-0 bg-brandNavy-900/90 backdrop-blur-md z-10 border-r border-white/5">
                    {r.employeeName}
                  </td>
                  {r.values.map((v, idx) => (
                    <td key={idx} className="px-4 py-2.5 text-right font-mono whitespace-nowrap text-muted2">
                      {v > 0 ? formatCurrencyVND(v) : "—"}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-400 whitespace-nowrap border-l border-white/10">
                    {formatCurrencyVND(r.ytdActual)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink whitespace-nowrap">
                    {r.ytdTarget > 0 ? formatCurrencyVND(r.ytdTarget) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                    {r.ytdCompletionPct != null ? (
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border",
                          r.ytdCompletionPct >= 100
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                            : r.ytdCompletionPct < 60
                            ? "bg-brandRed-500/15 text-brandRed-400 border-brandRed-500/30 shadow-[0_0_8px_rgba(200,16,46,0.15)]"
                            : "bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-[0_0_8px_rgba(224,163,39,0.15)]"
                        )}
                      >
                        {r.ytdCompletionPct}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {data && data.rows.length > 0 && (
              <tfoot className="border-t-2 border-white/10 bg-white/[0.03]">
                <tr>
                  <td className="px-4 py-3 font-semibold text-ink sticky left-0 bg-brandNavy-900/90 backdrop-blur-md z-10 border-r border-white/5">
                    Tổng cộng
                  </td>
                  {data.totals.map((t, idx) => (
                    <td key={idx} className="px-4 py-3 text-right font-mono font-semibold text-ink whitespace-nowrap">
                      {formatCurrencyVND(t)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap border-l border-white/10">
                    {formatCurrencyVND(data.ytdTotalActual)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink whitespace-nowrap">
                    {data.ytdTotalTarget > 0 ? formatCurrencyVND(data.ytdTotalTarget) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                    {data.ytdTotalCompletionPct != null ? (
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border",
                          data.ytdTotalCompletionPct >= 100
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.25)]"
                            : data.ytdTotalCompletionPct < 60
                            ? "bg-brandRed-500/20 text-brandRed-400 border-brandRed-500/40"
                            : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        )}
                      >
                        {data.ytdTotalCompletionPct}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
