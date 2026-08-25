"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrencyVND } from "@/lib/utils";

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
          <h2 className="font-medium text-ink">PO lên trong tháng — so sánh 3 tháng gần nhất</h2>
          <p className="text-xs text-muted-foreground">Giá trị PO đặt hàng theo từng nhân viên, theo ngày đặt PO.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="text-sm rounded-md border border-gray-200 py-2 px-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                Tháng {m}
              </option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="text-sm rounded-md border border-gray-200 py-2 px-2">
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
              <th className="text-left font-medium px-4 py-2.5">Nhân viên</th>
              {data?.months.map((m, idx) => (
                <th
                  key={m.label}
                  className="text-right font-medium px-4 py-2.5"
                >
                  {m.label}
                  {idx === monthCount - 1 && <span className="block text-[11px] text-muted2 font-normal">(đang xem)</span>}
                </th>
              ))}
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
                  Chưa có dữ liệu PO trong khoảng này.
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.employeeId} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-ink">{r.employeeName}</td>
                {r.values.map((v, idx) => (
                  <td key={idx} className="px-4 py-2.5 text-right">
                    {v > 0 ? formatCurrencyVND(v) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {data && data.rows.length > 0 && (
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td className="px-4 py-2.5 font-semibold text-ink">Tổng</td>
                {data.totals.map((t, idx) => (
                  <td key={idx} className="px-4 py-2.5 text-right font-semibold text-ink">
                    {formatCurrencyVND(t)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
