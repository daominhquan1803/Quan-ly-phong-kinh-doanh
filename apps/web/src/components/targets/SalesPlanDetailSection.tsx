"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrencyVND, cn } from "@/lib/utils";
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
          <h2 className="font-semibold text-ink text-sm tracking-wide">Kế hoạch chi tiết theo sản phẩm</h2>
          <p className="text-xs text-muted2 mt-0.5">
            Nhập từ Excel: Doanh số mục tiêu theo Nhân viên x Sản phẩm x Nhóm hàng. Thực hiện tính theo giá trị đã
            giao trong tháng.
          </p>
        </div>
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
          {isAdmin && (
            <button
              onClick={() => setShowWizard((v) => !v)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brandRed-600 to-brandRed-700 hover:from-brandRed-500 hover:to-brandRed-600 px-3.5 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(200,16,46,0.3)] transition-all"
            >
              <Upload className="h-4 w-4" />
              {showWizard ? "Đóng nhập file" : "Nhập Excel kế hoạch"}
            </button>
          )}
        </div>
      </div>

      {showWizard && (
        <div className="glass-card border border-white/10 p-5 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <SalesPlanImportWizard
            onDone={() => {
              queryClient.invalidateQueries({ queryKey: ["sales-plan-lines"] });
            }}
          />
        </div>
      )}

      {isLoading && (
        <div className="glass-card border border-white/10 p-8 text-center text-muted-foreground text-xs">
          <div className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            Đang tải kế hoạch chi tiết...
          </div>
        </div>
      )}
      {!isLoading && (data?.lines.length ?? 0) === 0 && (
        <div className="glass-card border border-white/10 p-8 text-center text-muted2 text-xs">
          Chưa có kế hoạch chi tiết cho tháng này.
        </div>
      )}
      {!isLoading &&
        data &&
        groupLines(data.lines).map((group) => (
          <div key={group.name} className="glass-card border border-white/10 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between flex-wrap gap-2 bg-white/[0.04] px-4 py-3 border-b border-white/5 backdrop-blur-md">
              <h3 className="font-semibold text-ink text-sm">Nhóm hàng {group.name}</h3>
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-muted2">
                  Chỉ tiêu: <span className="font-bold text-ink">{formatCurrencyVND(group.targetRevenue)}</span>
                </span>
                <span className="text-muted2">
                  Thực hiện: <span className="font-bold text-emerald-400">{formatCurrencyVND(group.actualRevenue)}</span>
                </span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-xs font-bold border",
                    group.completionPct != null && group.completionPct >= 100
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                      : group.completionPct != null
                      ? "bg-brandRed-500/15 text-alert border-brandRed-500/40"
                      : "bg-white/5 text-muted2 border-white/10"
                  )}
                >
                  {group.completionPct != null ? `${group.completionPct}%` : "—"}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-white/[0.02] text-muted-foreground border-b border-white/5">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Nhân viên</th>
                    <th className="text-right font-medium px-4 py-2.5">Chỉ tiêu</th>
                    <th className="text-right font-medium px-4 py-2.5">Thực hiện</th>
                    <th className="text-right font-medium px-4 py-2.5">% Đạt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {group.rows.map((r) => (
                    <tr key={r.key} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5 font-medium text-ink">
                        {r.employeeName}
                        {r.hasEmployeeTotalBasis && (
                          <span className="block text-[10px] text-muted2 font-normal">
                            *thực hiện = tổng NV (chưa tách theo nhóm)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-ink">{formatCurrencyVND(r.targetRevenue)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-400">{formatCurrencyVND(r.actualRevenue)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {r.completionPct != null ? (
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border",
                              r.completionPct >= 100
                                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                                : "bg-brandRed-500/15 text-alert border-brandRed-500/40"
                            )}
                          >
                            {r.completionPct}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-white/10 bg-white/[0.03]">
                  <tr>
                    <td className="px-4 py-3 font-semibold text-ink">Tổng nhóm {group.name}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-ink">
                      {formatCurrencyVND(group.targetRevenue)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                      {formatCurrencyVND(group.actualRevenue)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {group.completionPct != null ? (
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border",
                            group.completionPct >= 100
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.25)]"
                              : "bg-brandRed-500/20 text-alert border-brandRed-500/40"
                          )}
                        >
                          {group.completionPct}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                </tfoot>
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
