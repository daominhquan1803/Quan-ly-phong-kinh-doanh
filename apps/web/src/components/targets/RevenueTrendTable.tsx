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
          <h2 className="font-medium text-ink">Doanh số đi hàng từ đầu năm</h2>
          <p className="text-xs text-muted-foreground">
            Doanh số đã giao thực tế theo từng tháng (Tháng 1 → tháng đang xem), theo từng nhân viên.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Đến tháng</span>
          <select
            value={uptoMonth}
            onChange={(e) => setUptoMonth(Number(e.target.value))}
            className="text-sm bg-card text-ink rounded-md border border-gray-200 py-2 px-2"
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
            className="text-sm bg-card text-ink rounded-md border border-gray-200 py-2 px-2"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2.5 sticky left-0 bg-gray-50">Nhân viên</th>
              {data?.months.map((m, idx) => (
                <th key={m.label} className="text-right font-medium px-4 py-2.5 whitespace-nowrap">
                  {m.label}
                  {idx === monthCount - 1 && <span className="block text-[11px] text-muted2 font-normal">(gần nhất)</span>}
                </th>
              ))}
              <th className="text-right font-medium px-4 py-2.5 whitespace-nowrap border-l border-gray-200">Luỹ kế</th>
              <th className="text-right font-medium px-4 py-2.5 whitespace-nowrap">Chỉ tiêu luỹ kế</th>
              <th className="text-right font-medium px-4 py-2.5 whitespace-nowrap">% hoàn thành</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={colSpanCount} className="px-4 py-6 text-center text-muted-foreground">
                  Đang tải...
                </td>
              </tr>
            )}
            {!isLoading && (data?.rows.length ?? 0) === 0 && (
              <tr>
                <td colSpan={colSpanCount} className="px-4 py-6 text-center text-muted-foreground">
                  Chưa có dữ liệu trong khoảng này.
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.employeeId} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-ink sticky left-0 bg-card">{r.employeeName}</td>
                {r.values.map((v, idx) => (
                  <td key={idx} className="px-4 py-2.5 text-right whitespace-nowrap">
                    {v > 0 ? formatCurrencyVND(v) : "—"}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right font-medium text-ink whitespace-nowrap border-l border-gray-200">
                  {formatCurrencyVND(r.ytdActual)}
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap">
                  {r.ytdTarget > 0 ? formatCurrencyVND(r.ytdTarget) : "—"}
                </td>
                <td className={cn("px-4 py-2.5 text-right font-medium whitespace-nowrap", completionColor(r.ytdCompletionPct))}>
                  {r.ytdCompletionPct != null ? `${r.ytdCompletionPct}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          {data && data.rows.length > 0 && (
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td className="px-4 py-2.5 font-semibold text-ink sticky left-0 bg-gray-50">Tổng</td>
                {data.totals.map((t, idx) => (
                  <td key={idx} className="px-4 py-2.5 text-right font-semibold text-ink whitespace-nowrap">
                    {formatCurrencyVND(t)}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right font-semibold text-ink whitespace-nowrap border-l border-gray-200">
                  {formatCurrencyVND(data.ytdTotalActual)}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">
                  {data.ytdTotalTarget > 0 ? formatCurrencyVND(data.ytdTotalTarget) : "—"}
                </td>
                <td className={cn("px-4 py-2.5 text-right font-semibold whitespace-nowrap", completionColor(data.ytdTotalCompletionPct))}>
                  {data.ytdTotalCompletionPct != null ? `${data.ytdTotalCompletionPct}%` : "—"}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
