"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrencyVND } from "@/lib/utils";
import { Upload } from "lucide-react";
import { SalesPlanImportWizard } from "./SalesPlanImportWizard";

interface PlanLine {
  id: string;
  employeeName: string;
  productCode: string | null;
  productName: string | null;
  productGroup: string | null;
  targetRevenue: number;
  targetQuantity: number | null;
  actualRevenue: number;
  actualQuantity: number | null;
  actualBasis: "PRODUCT" | "EMPLOYEE_TOTAL" | "UNRESOLVED";
  completionPct: number | null;
}

export function SalesPlanDetailSection({ isAdmin }: { isAdmin: boolean }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [showWizard, setShowWizard] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["sales-plan-lines", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/targets/plan?year=${year}&month=${month}`);
      if (!res.ok) throw new Error("Không tải được kế hoạch chi tiết");
      return res.json() as Promise<{ lines: PlanLine[] }>;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-medium text-gray-900">Kế hoạch chi tiết theo sản phẩm</h2>
          <p className="text-xs text-gray-500">Nhập từ Excel: doanh số mục tiêu theo Nhân viên x Sản phẩm x Nhóm hàng</p>
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
        {isAdmin && (
          <button
            onClick={() => setShowWizard((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-brandRed-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brandRed-700"
          >
            <Upload className="h-4 w-4" />
            {showWizard ? "Đóng" : "Nhập Excel kế hoạch"}
          </button>
        )}
      </div>

      {showWizard && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <SalesPlanImportWizard
            onDone={() => {
              // Không tự đóng wizard — để người dùng thấy tóm tắt kết quả (Đã nhập/Lỗi/NV
              // chưa khớp) trước khi tự bấm đóng hoặc nhập file khác.
              queryClient.invalidateQueries({ queryKey: ["sales-plan-lines"] });
            }}
          />
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Nhân viên</th>
              <th className="text-left font-medium px-4 py-2.5">Mã hàng</th>
              <th className="text-left font-medium px-4 py-2.5">Nhóm hàng</th>
              <th className="text-right font-medium px-4 py-2.5">Chỉ tiêu</th>
              <th className="text-right font-medium px-4 py-2.5">Thực hiện</th>
              <th className="text-right font-medium px-4 py-2.5">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  Đang tải...
                </td>
              </tr>
            )}
            {!isLoading && (data?.lines.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  Chưa có kế hoạch chi tiết cho tháng này.
                </td>
              </tr>
            )}
            {data?.lines.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{l.employeeName}</td>
                <td className="px-4 py-2.5">{l.productCode ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {l.productGroup ?? "—"}
                  {l.actualBasis === "EMPLOYEE_TOTAL" && !l.productCode && (
                    <span className="block text-[11px] text-gray-400">*thực hiện = tổng NV (chưa tách theo nhóm)</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">{formatCurrencyVND(l.targetRevenue)}</td>
                <td className="px-4 py-2.5 text-right">{formatCurrencyVND(l.actualRevenue)}</td>
                <td className="px-4 py-2.5 text-right font-medium">
                  {l.completionPct != null ? `${l.completionPct}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
