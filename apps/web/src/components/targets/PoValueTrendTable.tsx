"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn, formatCurrencyVND } from "@/lib/utils";

interface MonthMeta {
  year: number;
  month: number;
  label: string;
}
interface TrendRow {
  employeeId: string;
  employeeName: string;
  values: number[];
}
interface TrendResponse {
  months: MonthMeta[];
  rows: TrendRow[];
  totals: number[];
}

/** Bảng "PO lên trong tháng" so sánh tháng đang xem với 2 tháng trước đó, theo từng nhân viên. */
export function PoValueTrendTable() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["targets-po-trend", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/targets/po-trend?year=${year}&month=${month}`);
      if (!res.ok) throw new Error("Không tải được bảng so sánh PO lên trong tháng");
      return res.json() as Promise<TrendResponse>;
    },
  });
  const monthCount = data?.months.length ?? 3;
  const colSpanCount = monthCount + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-ink text-sm tracking-wide">PO lên trong tháng — So sánh 3 tháng gần nhất</h2>
          <p className="text-xs text-muted2 mt-0.5">Giá trị PO đặt hàng theo từng nhân viên, theo ngày đặt PO.</p>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      <div className="glass-card border border-white/10 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-white/[0.04] text-muted-foreground border-b border-white/5 backdrop-blur-md">
              <tr>
                <th className="text-left font-medium px-4 py-3">Nhân viên</th>
                {data?.months.map((m, idx) => (
                  <th
                    key={m.label}
                    className="text-right font-medium px-4 py-3"
                  >
                    {m.label}
                    {idx === monthCount - 1 && <span className="block text-[10px] text-amber-400 font-normal tracking-wide">(đang xem)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading && (
                <tr>
                  <td colSpan={colSpanCount} className="px-4 py-8 text-center text-muted-foreground">
                    <div className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                      Đang tải số liệu PO...
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && (data?.rows.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={colSpanCount} className="px-4 py-8 text-center text-muted-foreground">
                    Chưa có dữ liệu PO trong khoảng này.
                  </td>
                </tr>
              )}
              {data?.rows.map((r) => (
                <tr key={r.employeeId} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 font-medium text-ink">{r.employeeName}</td>
                  {r.values.map((v, idx) => (
                    <td key={idx} className="px-4 py-2.5 text-right font-mono text-ink">
                      {v > 0 ? (
                        <span className={idx === monthCount - 1 ? "font-semibold text-amber-300" : "text-muted2"}>
                          {formatCurrencyVND(v)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {data && data.rows.length > 0 && (
              <tfoot className="border-t-2 border-white/10 bg-white/[0.03]">
                <tr>
                  <td className="px-4 py-3 font-semibold text-ink">Tổng cộng</td>
                  {data.totals.map((t, idx) => (
                    <td
                      key={idx}
                      className={cn(
                        "px-4 py-3 text-right font-mono font-bold",
                        idx === monthCount - 1 ? "text-amber-400" : "text-ink"
                      )}
                    >
                      {formatCurrencyVND(t)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
