"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { cn, formatCurrencyVND } from "@/lib/utils";

type Metric = "delivered" | "oih";

interface Row {
  key: string;
  customerCode: string;
  customerName: string;
  value: number;
  poCount: number;
}

const LABEL: Record<Metric, string> = { delivered: "Thực hiện (đã giao)", oih: "OIH (chưa giao)" };

/**
 * Chi tiết theo khách của 1 nhân viên trong 1 tháng: Thực hiện (đã giao) và/hoặc OIH. Dùng ở trang Kế hoạch kinh doanh
 * (bảng nhân viên: cả 2 mục) và "Kế hoạch chi tiết theo sản phẩm" (chỉ thực hiện, theo nhóm Sản xuất / Thương mại).
 * `expected` = số đang hiện trên bảng — nếu tổng chi tiết khác thì báo để anh biết.
 */
export function TargetCustomerBreakdown({
  year,
  month,
  employeeId,
  employeeName,
  group = "all",
  metrics,
  expected,
  onClose,
}: {
  year: number;
  month: number;
  employeeId: string;
  employeeName: string;
  group?: "all" | "Sản xuất" | "Thương mại";
  metrics: Metric[];
  expected?: Partial<Record<Metric, number>>;
  onClose: () => void;
}) {
  const [metric, setMetric] = useState<Metric>(metrics[0]);
  const { data, isFetching, isError } = useQuery({
    queryKey: ["targets-detail", year, month, employeeId, metric, group],
    queryFn: async () => {
      const p = new URLSearchParams({ year: String(year), month: String(month), employeeId, metric, group });
      const res = await fetch(`/api/targets/detail?${p.toString()}`);
      if (!res.ok) throw new Error("detail");
      return (await res.json()) as { rows: Row[]; total: number };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const shown = expected?.[metric];
  const differs = data && shown !== undefined && Math.abs(shown - total) > 1;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-black/30 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">
            {employeeName} — tháng {month}/{year}
            {group !== "all" && <span className="text-amber-300"> — nhóm hàng {group}</span>}
          </p>
          <p className="text-[11px] text-muted2 mt-0.5">
            {metric === "delivered"
              ? `Giá trị các đợt giao trong tháng theo từng khách${group !== "all" ? " (mã hàng SI/SB là Sản xuất, còn lại là Thương mại; dòng không có mã hàng không xếp nhóm)" : ""}.`
              : "Giá trị hàng chưa giao của các PO đang mở theo từng khách."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {metrics.length > 1 &&
            metrics.map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                  metric === m ? "border-amber-500/60 bg-amber-500/15 text-amber-300" : "border-white/10 bg-white/[0.03] text-ink hover:bg-white/[0.08]"
                )}
              >
                {LABEL[m]}
              </button>
            ))}
          <button onClick={onClose} className="text-muted2 hover:text-ink" aria-label="Đóng chi tiết">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted2" />}
      {isError && <p className="text-xs text-alert">Không tải được chi tiết. Thử lại sau.</p>}

      {data && (
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="min-w-full text-xs">
            <thead className="text-muted-foreground sticky top-0 bg-navy-900">
              <tr>
                <th className="text-left font-medium px-3 py-2">Khách hàng</th>
                <th className="text-right font-medium px-3 py-2">Số PO</th>
                <th className="text-right font-medium px-3 py-2">{LABEL[metric]}</th>
                <th className="text-right font-medium px-3 py-2">Tỷ trọng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Không có số liệu.</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-ink">
                    <span className="font-medium">{r.customerCode}</span>
                    {r.customerName && <span className="block text-[11px] text-muted2 max-w-[360px] truncate">{r.customerName}</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted2">{r.poCount}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-400">{formatCurrencyVND(r.value)}</td>
                  <td className="px-3 py-2 text-right font-mono text-muted2">{total > 0 ? `${((r.value / total) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-white/10 font-semibold">
                <tr>
                  <td className="px-3 py-2 text-ink">Tổng ({rows.length} khách)</td>
                  <td />
                  <td className="px-3 py-2 text-right font-mono text-emerald-400">{formatCurrencyVND(total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {differs && (
        <p className="text-[11px] text-amber-300/90">
          Số trên bảng là {formatCurrencyVND(shown!)}, chênh {formatCurrencyVND(shown! - total)} so với tổng chi tiết (bảng có thể tính theo mã sản phẩm của kế hoạch, hoặc gộp cả dòng không có mã hàng).
        </p>
      )}
    </div>
  );
}
