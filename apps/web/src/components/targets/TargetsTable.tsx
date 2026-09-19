"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrencyVND } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface TargetRow {
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
  targetRevenue: number;
  actualRevenue: number;
  poValue: number;
  oihValue: number;
  completionPct: number | null;
}

export function TargetsTable() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["targets", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/targets?year=${year}&month=${month}`);
      if (!res.ok) throw new Error("Không tải được kế hoạch kinh doanh");
      return res.json() as Promise<{ rows: TargetRow[] }>;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
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

      <div className="glass-card border border-white/10 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-white/[0.04] text-muted-foreground border-b border-white/5 backdrop-blur-md">
              <tr>
                <th className="text-left font-medium px-4 py-3">Nhân viên</th>
                <th className="text-right font-medium px-4 py-3">Chỉ tiêu</th>
                <th className="text-right font-medium px-4 py-3">Thực hiện (đã giao)</th>
                <th className="text-right font-medium px-4 py-3">% Hoàn thành</th>
                <th className="text-right font-medium px-4 py-3">Giá trị còn thiếu</th>
                <th className="text-right font-medium px-4 py-3" title="Order In Hand — giá trị hàng chưa giao của các PO đặt trong tháng">
                  OIH
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    <div className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                      Đang tải kế hoạch kinh doanh...
                    </div>
                  </td>
                </tr>
              )}
              {data?.rows.map((r) => {
                const shortfall = Math.max(0, r.targetRevenue - r.actualRevenue);
                return (
                  <tr key={r.employeeId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5 font-medium text-ink">{r.employeeName}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink">{formatCurrencyVND(r.targetRevenue)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-400">{formatCurrencyVND(r.actualRevenue)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {r.completionPct != null ? (
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border",
                            r.completionPct >= 100
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                              : "bg-brandRed-500/15 text-alert border-brandRed-500/40 shadow-[0_0_8px_rgba(255,59,71,0.25)]"
                          )}
                        >
                          {r.completionPct}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={cn("px-4 py-2.5 text-right font-mono", shortfall > 0 ? "text-alert font-bold" : "text-muted2")}>
                      {shortfall > 0 ? formatCurrencyVND(shortfall) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted2">{formatCurrencyVND(r.oihValue)}</td>
                  </tr>
                );
              })}
            </tbody>
            {data && data.rows.length > 0 && (
              <tfoot className="border-t-2 border-white/10 bg-white/[0.03]">
                <tr>
                  <td className="px-4 py-3 font-semibold text-ink">Tổng cộng</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-ink">
                    {formatCurrencyVND(data.rows.reduce((s, r) => s + r.targetRevenue, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                    {formatCurrencyVND(data.rows.reduce((s, r) => s + r.actualRevenue, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-ink">
                    {(() => {
                      const totalTarget = data.rows.reduce((s, r) => s + r.targetRevenue, 0);
                      const totalActual = data.rows.reduce((s, r) => s + r.actualRevenue, 0);
                      const pct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : null;
                      return pct != null ? (
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border",
                            pct >= 100
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.25)]"
                              : "bg-brandRed-500/20 text-alert border-brandRed-500/40"
                          )}
                        >
                          {pct}%
                        </span>
                      ) : (
                        "—"
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-alert">
                    {formatCurrencyVND(data.rows.reduce((s, r) => s + Math.max(0, r.targetRevenue - r.actualRevenue), 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-muted2">
                    {formatCurrencyVND(data.rows.reduce((s, r) => s + r.oihValue, 0))}
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

