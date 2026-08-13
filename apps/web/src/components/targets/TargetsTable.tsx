"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrencyVND } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface TargetRow {
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
  targetRevenue: number;
  actualRevenue: number;
  completionPct: number | null;
}

export function TargetsTable({ isAdmin }: { isAdmin: boolean }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["targets", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/targets?year=${year}&month=${month}`);
      if (!res.ok) throw new Error("Không tải được kế hoạch kinh doanh");
      return res.json() as Promise<{ rows: TargetRow[] }>;
    },
  });

  async function handleSave(employeeId: string) {
    const raw = editing[employeeId];
    const targetRevenue = Number(raw);
    if (!Number.isFinite(targetRevenue) || targetRevenue < 0) return;
    setSaving(employeeId);
    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, year, month, targetRevenue }),
      });
      if (!res.ok) throw new Error("Lưu thất bại");
      await queryClient.invalidateQueries({ queryKey: ["targets", year, month] });
      setEditing((prev) => {
        const next = { ...prev };
        delete next[employeeId];
        return next;
      });
    } finally {
      setSaving(null);
    }
  }

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
              <th className="text-right font-medium px-4 py-2.5">Thực hiện</th>
              <th className="text-right font-medium px-4 py-2.5">% Hoàn thành</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  Đang tải...
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.employeeId} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{r.employeeName}</td>
                <td className="px-4 py-2.5 text-right">
                  {isAdmin ? (
                    <div className="flex items-center justify-end gap-2">
                      <input
                        type="number"
                        placeholder={String(r.targetRevenue)}
                        value={editing[r.employeeId] ?? ""}
                        onChange={(e) => setEditing((prev) => ({ ...prev, [r.employeeId]: e.target.value }))}
                        className="w-32 text-right text-sm rounded-md border border-gray-200 py-1 px-2"
                      />
                      <button
                        onClick={() => handleSave(r.employeeId)}
                        disabled={saving === r.employeeId || !editing[r.employeeId]}
                        className="text-xs font-medium text-navy-900 hover:underline disabled:opacity-40"
                      >
                        Lưu
                      </button>
                    </div>
                  ) : (
                    formatCurrencyVND(r.targetRevenue)
                  )}
                </td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
