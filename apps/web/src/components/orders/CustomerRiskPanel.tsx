"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, TrendingDown, Clock, Info } from "lucide-react";
import { cn, formatCurrencyVND, formatDateVN } from "@/lib/utils";
import type { CustomerRiskLevel } from "@/lib/customer-risk";

interface RiskRow {
  customerName: string;
  customerCode: string | null;
  employeeName: string | null;
  level: CustomerRiskLevel;
  silentDays: number;
  medianGapDays: number;
  p90GapDays: number;
  ratio: number;
  orderDayCount: number;
  orderCount: number;
  lastOrderDate: string;
  totalValue: number;
  recent90Value: number;
  previous90Value: number;
  trendPct: number | null;
}
interface RiskReport {
  rows: RiskRow[];
  latestOrderDate: string | null;
  dataLagDays: number;
  analyzedCustomerCount: number;
}

const LEVEL_STYLE: Record<CustomerRiskLevel, { badge: string; label: string; dot: string }> = {
  HIGH: { badge: "bg-brandRed-50 text-brandRed-600", label: "Nguy cơ cao", dot: "bg-brandRed-600" },
  MEDIUM: { badge: "bg-warning-500/10 text-warning-500", label: "Cảnh báo", dot: "bg-warning-500" },
  WATCH: { badge: "bg-amber-500/10 text-amber-500", label: "Cần theo dõi", dot: "bg-amber-500" },
  DECLINING: { badge: "bg-blue-500/10 text-blue-500", label: "Sụt giá trị", dot: "bg-blue-500" },
};

const LEVEL_ORDER: CustomerRiskLevel[] = ["HIGH", "MEDIUM", "WATCH", "DECLINING"];

/** Số thập phân kiểu Việt Nam (dấu phẩy), bỏ phần thập phân khi là số tròn. */
function num(v: number): string {
  return (Math.round(v * 10) / 10).toLocaleString("vi-VN");
}

/** Diễn giải nhịp đặt hàng thành câu tiếng Việt dễ đọc thay vì bắt người dùng tự suy từ con số. */
function rhythmText(r: RiskRow): string {
  const nice = r.medianGapDays >= 1 ? `${num(r.medianGapDays)} ngày` : "dưới 1 ngày";
  return `Thường đặt mỗi ~${nice} · đã im lặng ${r.silentDays} ngày (gấp ${num(r.ratio)} lần)`;
}

export function CustomerRiskPanel({ employeeId }: { employeeId: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["customer-risk", employeeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeId) params.set("employeeId", employeeId);
      const res = await fetch(`/api/orders/customer-risk?${params.toString()}`);
      if (!res.ok) throw new Error("Không tải được cảnh báo khách hàng");
      return res.json() as Promise<RiskReport>;
    },
  });

  if (isLoading || !data || data.rows.length === 0) return null;

  const high = data.rows.filter((r) => r.level === "HIGH");
  const highValue = high.reduce((s, r) => s + r.totalValue, 0);
  const shown = expanded ? data.rows : data.rows.slice(0, 5);

  return (
    <div className="rounded-xl border border-brandRed-600/30 bg-gradient-to-br from-brandRed-600/5 to-amber-500/5">
      <div className="flex items-start gap-3 px-4 py-3">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-brandRed-600" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-brandRed-600">
            Cảnh báo khách hàng có nguy cơ mất
          </p>
          <p className="mt-0.5 text-sm text-ink2">
            {high.length > 0 ? (
              <>
                <strong>{high.length} khách</strong> đang im lặng bất thường so với nhịp đặt hàng của chính họ
                {highValue > 0 && (
                  <>
                    {" "}— tương ứng <strong>{formatCurrencyVND(highValue)}</strong> giá trị đơn đã phát sinh
                  </>
                )}
                .
              </>
            ) : (
              <>{data.rows.length} khách cần chú ý về nhịp đặt hàng.</>
            )}{" "}
            <span className="text-muted-foreground">
              Đã soi {data.analyzedCustomerCount} khách có đủ lịch sử để xác định nhịp.
            </span>
          </p>

          {/* Đồng bộ AMIS chạy hằng ngày; nếu dữ liệu chậm nhiều ngày thì MỌI số "ngày im lặng"
              bên dưới đều bị cộng thêm đúng ngần ấy — nói thẳng để không ai hoảng vì báo động giả. */}
          {data.dataLagDays >= 4 && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-warning-500">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Dữ liệu đơn hàng mới nhất là {formatDateVN(data.latestOrderDate)} — chậm {data.dataLagDays} ngày so
              với hôm nay. Số ngày im lặng bên dưới đang bị cộng thêm {data.dataLagDays} ngày; nên đồng bộ AMIS
              lại trước khi kết luận.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-brandRed-600/15">
        {LEVEL_ORDER.map((level) => {
          const group = shown.filter((r) => r.level === level);
          if (group.length === 0) return null;
          return (
            <div key={level}>
              {group.map((r) => (
                <div
                  key={r.customerName}
                  className="flex flex-col gap-1 border-b border-gray-200/40 px-4 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
                >
                  <span
                    className={cn(
                      "inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      LEVEL_STYLE[r.level].badge
                    )}
                  >
                    {LEVEL_STYLE[r.level].label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink" title={r.customerName}>
                      {r.customerName}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {r.level === "DECLINING" ? (
                        <span className="inline-flex items-center gap-1">
                          <TrendingDown className="h-3 w-3" />
                          Giá trị 90 ngày gần nhất giảm {Math.abs(r.trendPct ?? 0)}% so kỳ trước
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {rhythmText(r)}
                        </span>
                      )}
                      <span>· Đơn cuối {formatDateVN(r.lastOrderDate)}</span>
                      {r.employeeName && <span>· {r.employeeName}</span>}
                    </p>
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <p className="text-sm font-semibold text-ink">{formatCurrencyVND(r.totalValue)}</p>
                    {r.trendPct != null && r.level !== "DECLINING" && (
                      <p
                        className={cn(
                          "text-[11px]",
                          r.trendPct < 0 ? "text-brandRed-600" : "text-success-600"
                        )}
                      >
                        {r.trendPct >= 0 ? "+" : ""}
                        {r.trendPct}% so kỳ trước
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {data.rows.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-brandRed-600/15 py-2 text-xs font-medium text-brandRed-600 hover:bg-brandRed-600/5"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> Thu gọn
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Xem tất cả {data.rows.length} cảnh báo
            </>
          )}
        </button>
      )}
    </div>
  );
}
