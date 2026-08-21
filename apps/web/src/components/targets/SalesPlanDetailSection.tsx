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
  actualBasis: "PRODUCT" | "PRODUCT_GROUP" | "EMPLOYEE_TOTAL" | "UNRESOLVED";
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
          <p className="text-xs text-gray-500">
            Nhập từ Excel: doanh số mục tiêu theo Nhân viên x Sản phẩm x Nhóm hàng. Thực hiện tính theo giá trị đã
            giao trong tháng.
          </p>
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

      {isLoading && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-gray-500 text-sm">
          Đang tải...
        </div>
      )}
      {!isLoading && (data?.lines.length ?? 0) === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-gray-500 text-sm">
          Chưa có kế hoạch chi tiết cho tháng này.
        </div>
      )}
      {!isLoading &&
        data &&
        groupLines(data.lines).map((group) => (
          <div key={group.name} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between flex-wrap gap-2 bg-gray-50 px-4 py-2.5 border-b border-gray-200">
              <h3 className="font-medium text-gray-900">Nhóm hàng {group.name}</h3>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <span>
                  Chỉ tiêu: <span className="font-medium text-gray-900">{formatCurrencyVND(group.targetRevenue)}</span>
                </span>
                <span>
                  Thực hiện: <span className="font-medium text-gray-900">{formatCurrencyVND(group.actualRevenue)}</span>
                </span>
                <span className="font-semibold text-navy-900">
                  {group.completionPct != null ? `${group.completionPct}%` : "—"}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-gray-500">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Nhân viên</th>
                    <th className="text-right font-medium px-4 py-2">Chỉ tiêu</th>
                    <th className="text-right font-medium px-4 py-2">Thực hiện</th>
                    <th className="text-right font-medium px-4 py-2">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {group.rows.map((r) => (
                    <tr key={r.key} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {r.employeeName}
                        {r.hasEmployeeTotalBasis && (
                          <span className="block text-[11px] text-gray-400 font-normal">
                            *thực hiện = tổng NV (chưa tách theo nhóm)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">{formatCurrencyVND(r.targetRevenue)}</td>
                      <td className="px-4 py-2.5 text-right">{formatCurrencyVND(r.actualRevenue)}</td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        {r.completionPct != null ? `${r.completionPct}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}

interface EmployeeRow {
  key: string;
  employeeName: string;
  targetRevenue: number;
  actualRevenue: number;
  completionPct: number | null;
  hasEmployeeTotalBasis: boolean;
}

/**
 * Gộp nhiều dòng kế hoạch (1 dòng/sản phẩm) của cùng 1 nhân viên trong 1 nhóm hàng thành
 * đúng 1 dòng. Chỉ tiêu cộng dồn bình thường (mỗi dòng là 1 phần chỉ tiêu khác nhau), nhưng
 * "Thực hiện" ở basis PRODUCT_GROUP/EMPLOYEE_TOTAL là *cùng 1 con số* (doanh số thực hiện
 * của nhân viên trong đúng nhóm hàng này, hoặc tổng cả nhân viên nếu không xác định được
 * nhóm) lặp lại trên mọi dòng sản phẩm — nên chỉ được cộng 1 lần duy nhất, không phải cộng
 * theo số dòng, nếu không sẽ ra số ảo nhân lên theo số sản phẩm.
 */
function aggregateByEmployee(lines: PlanLine[]): EmployeeRow[] {
  const buckets = new Map<
    string,
    { employeeName: string; targetRevenue: number; productActual: number; groupActual: number | null; hasEmployeeTotalFallback: boolean }
  >();
  for (const l of lines) {
    const key = l.employeeName; // tên hiển thị đã là danh tính nhân viên duy nhất trong 1 tháng
    if (!buckets.has(key)) {
      buckets.set(key, {
        employeeName: l.employeeName,
        targetRevenue: 0,
        productActual: 0,
        groupActual: null,
        hasEmployeeTotalFallback: false,
      });
    }
    const b = buckets.get(key)!;
    b.targetRevenue += l.targetRevenue;
    if (l.actualBasis === "PRODUCT") {
      b.productActual += l.actualRevenue; // theo đúng mã hàng — cộng dồn được
    } else if (l.actualBasis === "PRODUCT_GROUP" || l.actualBasis === "EMPLOYEE_TOTAL") {
      b.groupActual = l.actualRevenue; // cùng 1 giá trị lặp lại theo nhân viên trong nhóm này — lấy 1 lần
      if (l.actualBasis === "EMPLOYEE_TOTAL") b.hasEmployeeTotalFallback = true;
    }
  }

  return Array.from(buckets.entries())
    .map(([key, b]) => {
      const actualRevenue = b.productActual + (b.groupActual ?? 0);
      return {
        key,
        employeeName: b.employeeName,
        targetRevenue: b.targetRevenue,
        actualRevenue,
        completionPct: b.targetRevenue > 0 ? Math.round((actualRevenue / b.targetRevenue) * 100) : null,
        hasEmployeeTotalBasis: b.hasEmployeeTotalFallback,
      };
    })
    .sort((a, b) => b.targetRevenue - a.targetRevenue);
}

/**
 * Gộp kế hoạch chi tiết thành 2 nhóm cố định "Sản xuất" và "Thương mại" theo đúng cách
 * công ty phân loại — dòng nào có Nhóm hàng khác (vd "Dịch vụ", hoặc thiếu nhóm) được gom
 * vào "Khác" ở cuối, không bị ẩn mất dữ liệu dù không khớp 1 trong 2 nhóm chính. Mỗi nhóm
 * sau đó gộp tiếp theo từng nhân viên (xem aggregateByEmployee) — tổng của nhóm luôn khớp
 * đúng tổng các dòng nhân viên bên dưới nó.
 */
function groupLines(lines: PlanLine[]) {
  const order = ["Sản xuất", "Thương mại"];
  const buckets = new Map<string, PlanLine[]>();
  for (const l of lines) {
    const key = order.includes(l.productGroup ?? "") ? (l.productGroup as string) : "Khác";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(l);
  }

  const names = [...order.filter((n) => buckets.has(n)), ...(buckets.has("Khác") ? ["Khác"] : [])];

  return names.map((name) => {
    const rows = aggregateByEmployee(buckets.get(name)!);
    const targetRevenue = rows.reduce((s, r) => s + r.targetRevenue, 0);
    const actualRevenue = rows.reduce((s, r) => s + r.actualRevenue, 0);
    return {
      name,
      rows,
      targetRevenue,
      actualRevenue,
      completionPct: targetRevenue > 0 ? Math.round((actualRevenue / targetRevenue) * 100) : null,
    };
  });
}
