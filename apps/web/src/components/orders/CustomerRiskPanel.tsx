"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, TrendingDown, Clock, Info, ShieldAlert } from "lucide-react";
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
  HIGH: {
    badge: "bg-brandRed-50 text-alert border border-brandRed-600/30 shadow-[0_0_8px_rgba(200,16,46,0.15)] animate-pulse",
    label: "Nguy cơ cao",
    dot: "bg-brandRed-600 shadow-[0_0_6px_#C8102E]",
  },
  MEDIUM: {
    badge: "bg-warning-500/10 text-warning-500 border border-warning-500/30",
    label: "Cảnh báo",
    dot: "bg-warning-500",
  },
  WATCH: {
    badge: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
    label: "Cần theo dõi",
    dot: "bg-amber-500",
  },
  DECLINING: {
    badge: "bg-blue-500/10 text-blue-400 border border-blue-500/30",
    label: "Sụt giá trị",
    dot: "bg-blue-400",
  },
};

const LEVEL_ORDER: CustomerRiskLevel[] = ["HIGH", "MEDIUM", "WATCH", "DECLINING"];

function num(v: number): string {
  return (Math.round(v * 10) / 10).toLocaleString("vi-VN");
}

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
    <div className="rounded-2xl border border-brandRed-600/40 bg-gradient-to-br from-navy-900/95 via-brandRed-50/10 to-navy-900/95 shadow-card backdrop-blur-xl transition-all">
      <div className="flex items-start gap-3.5 p-4 sm:p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brandRed-50 border border-brandRed-600/30 text-alert shadow-[0_0_12px_rgba(200,16,46,0.2)]">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-alert">
              Cảnh báo khách hàng có nguy cơ mất
            </span>
          </div>
          <p className="text-sm text-ink2 leading-relaxed">
            {high.length > 0 ? (
              <>
                <strong className="text-alert">{high.length} khách hàng</strong> đang im lặng bất thường so với nhịp đặt hàng của chính họ
                {highValue > 0 && (
                  <>
                    {" "}— tương ứng <strong className="text-ink font-mono">{formatCurrencyVND(highValue)}</strong> giá trị đơn đã phát sinh
                  </>
                )}
                .
              </>
            ) : (
              <>{data.rows.length} khách cần chú ý về nhịp đặt hàng.</>
            )}{" "}
            <span className="text-muted-foreground text-xs">
              (Đã phân tích {data.analyzedCustomerCount} khách có đủ lịch sử để xác định nhịp)
            </span>
          </p>

          {data.dataLagDays >= 4 && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-500 rounded-lg bg-warning-500/10 p-2 border border-warning-500/20">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Dữ liệu đơn hàng mới nhất là {formatDateVN(data.latestOrderDate)} — chậm {data.dataLagDays} ngày so
                với hôm nay. Số ngày im lặng đang bị cộng thêm {data.dataLagDays} ngày; nên đồng bộ AMIS lại trước khi kết luận.
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-gray-200/50 divide-y divide-gray-200/30">
        {LEVEL_ORDER.map((level) => {
          const group = shown.filter((r) => r.level === level);
          if (group.length === 0) return null;
          return (
            <div key={level}>
              {group.map((r) => (
                <div
                  key={r.customerName}
                  className="flex flex-col gap-1.5 px-4 sm:px-5 py-3 transition-colors hover:bg-navy-50/40 sm:flex-row sm:items-center sm:gap-3"
                >
                  <span
                    className={cn(
                      "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                      LEVEL_STYLE[r.level].badge
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", LEVEL_STYLE[r.level].dot)}></span>
                    {LEVEL_STYLE[r.level].label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink" title={r.customerName}>
                      {r.customerName}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      {r.level === "DECLINING" ? (
                        <span className="inline-flex items-center gap-1 text-blue-400 font-medium">
                          <TrendingDown className="h-3 w-3" />
                          Giá trị 90 ngày gần nhất giảm {Math.abs(r.trendPct ?? 0)}% so kỳ trước
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted2">
                          <Clock className="h-3 w-3" />
                          {rhythmText(r)}
                        </span>
                      )}
                      <span>· Đơn cuối {formatDateVN(r.lastOrderDate)}</span>
                      {r.employeeName && <span>· NVKD: {r.employeeName}</span>}
                    </p>
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <p className="text-sm font-mono font-bold text-ink">{formatCurrencyVND(r.totalValue)}</p>
                    {r.trendPct != null && r.level !== "DECLINING" && (
                      <p
                        className={cn(
                          "text-[11px] font-mono",
                          r.trendPct < 0 ? "text-alert" : "text-success-600"
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
          className="flex w-full items-center justify-center gap-1.5 border-t border-gray-200/50 py-2.5 text-xs font-semibold text-alert hover:bg-brandRed-50/10 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> Thu gọn danh sách
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Xem tất cả {data.rows.length} khách hàng có nguy cơ
            </>
          )}
        </button>
      )}
    </div>
  );
}
