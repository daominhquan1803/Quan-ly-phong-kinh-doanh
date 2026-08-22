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
      <div className="flex items-center gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="text-sm rounded-md border border-gray-200 py-2 px-2"
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
          className="text-sm rounded-md border border-gray-200 py-2 px-2"
        >
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Nhân viên</th>
              <th className="text-right font-medium px-4 py-2.5">Chỉ tiêu</th>
              <th className="text-right font-medium px-4 py-2.5">Thực hiện (đã giao)</th>
              <th className="text-right font-medium px-4 py-2.5">% Hoàn thành</th>
              <th className="text-right font-medium px-4 py-2.5">Giá trị PO đặt hàng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Đang tải...
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.employeeId} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{r.employeeName}</td>
                <td className="px-4 py-2.5 text-right">{formatCurrencyVND(r.targetRevenue)}</td>
                <td className="px-4 py-2.5 text-right">{formatCurrencyVND(r.actualRevenue)}</td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right font-medium",
                    r.completionPct != null && r.completionPct >= 100
                      ? "text-success-600"
                      : r.completionPct != null && r.completionPct < 60
                      ? "text-brandRed-600"
                      : "text-gray-900"
                  )}
                >
                  {r.completionPct != null ? `${r.completionPct}%` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-500">{formatCurrencyVND(r.poValue)}</td>
              </tr>
            ))}
          </tbody>
          {data && data.rows.length > 0 && (
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td className="px-4 py-2.5 font-semibold text-gray-900">Tổng</td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                  {formatCurrencyVND(data.rows.reduce((s, r) => s + r.targetRevenue, 0))}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                  {formatCurrencyVND(data.rows.reduce((s, r) => s + r.actualRevenue, 0))}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-navy-900">
                  {(() => {
                    const totalTarget = data.rows.reduce((s, r) => s + r.targetRevenue, 0);
                    const totalActual = data.rows.reduce((s, r) => s + r.actualRevenue, 0);
                    return totalTarget > 0 ? `${Math.round((totalActual / totalTarget) * 100)}%` : "—";
                  })()}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                  {formatCurrencyVND(data.rows.reduce((s, r) => s + r.poValue, 0))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
