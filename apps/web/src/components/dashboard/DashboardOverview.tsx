"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrencyVND, formatDateVN } from "@/lib/utils";
import {
  AlertTriangle,
  Lightbulb,
  Minus,
  TrendingDown,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Target,
  CreditCard,
  Sparkles,
  Trophy,
  ArrowRight,
  BarChart3,
  PieChart as PieChartIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OrderTrendChart } from "./OrderTrendChart";
import { CHART_GRID_STROKE, CHART_TICK, CHART_TOOLTIP_STYLE, LEGEND_STYLE } from "./chart-theme";

interface SummaryResponse {
  year: number;
  month: number;
  totalTarget: number;
  totalActual: number;
  totalPoValue: number;
  completionPct: number | null;
  actualTrendPct: number | null;
  poTrendPct: number | null;
  completionTrendPts: number | null;
  perEmployee: {
    employeeId: string;
    employeeName: string;
    targetRevenue: number;
    actualRevenue: number;
    poValue: number;
    completionPct: number | null;
  }[];
  byProductGroup: {
    group: string;
    targetRevenue: number;
    actualRevenue: number;
    completionPct: number | null;
  }[];
  overdueOrderCount: number;
  overdueOrders: {
    poCode: string;
    customerName: string;
    salesEmployeeName: string | null;
    expectedDeliveryDate: string | null;
    remainingValue: number;
  }[];
  debtTotal: number | null;
  debtOverdue: number | null;
  debtUpdatedAt: string | null;
  debtPerEmployee?: {
    employeeId: string | null;
    employeeName: string;
    totalDebt: number;
    overdueDebt: number;
    overdueRate: number | null;
    weekPlanned: number;
    weekCollected: number;
    weekRate: number | null;
  }[];
  debtWeek?: { start: string; end: string };
}

const pct1 = (r: number | null) => (r == null ? "—" : `${(r * 100).toFixed(1)}%`);
// Tỉ lệ nợ quá hạn càng thấp càng tốt; tỉ lệ thu hồi kế hoạch tuần càng cao càng tốt.
const overdueRateColor = (r: number | null) =>
  r == null ? "text-muted2" : r <= 0.15 ? "text-success-600" : "text-alert";
// Chưa đạt kế hoạch thu (< 100%) luôn đỏ tươi để nhắc nhở.
const collectRateColor = (r: number | null) =>
  r == null ? "text-muted2" : r >= 1 ? "text-success-600" : "text-alert";

/** Dòng nhỏ hiện xu hướng tăng/giảm so với tháng trước dưới mỗi số KPI. */
function TrendLine({
  delta,
  unit,
  invert,
}: {
  delta: number | null;
  unit: string;
  invert?: boolean;
}) {
  if (delta == null) return null;
  const isUp = delta > 0;
  const isGood = invert ? !isUp : isUp;
  const Icon = delta === 0 ? Minus : isUp ? TrendingUp : TrendingDown;
  const color = delta === 0 ? "text-muted2" : isGood ? "text-success-600" : "text-alert";
  const bgColor = delta === 0 ? "bg-gray-100" : isGood ? "bg-success-600/10 border-success-600/20" : "bg-brandRed-50 border-brandRed-600/20";
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border mt-2", color, bgColor)}>
      <Icon className="h-3 w-3 shrink-0" />
      <span>
        {delta > 0 ? "+" : ""}
        {delta}
        {unit} so với tháng trước
      </span>
    </div>
  );
}

const RANK_COLORS = ["#E0A327", "#C8102E", "#5B8DEF", "#22B378", "#D4A017", "#8b96ab"];
const GROUP_COLORS: Record<string, string> = {
  "Sản xuất": "#E0A327",
  "Thương mại": "#C8102E",
  Khác: "#5b6478",
};

export function DashboardOverview({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/summary");
      if (!res.ok) throw new Error("Không tải được dữ liệu tổng quan");
      return res.json() as Promise<SummaryResponse>;
    },
  });

  const chartData = data?.perEmployee.map((e) => ({
    name: e.employeeName,
    "Kế hoạch": e.targetRevenue,
    "Thực hiện": e.actualRevenue,
  }));

  const topEmployees = data?.perEmployee.slice().sort((a, b) => b.actualRevenue - a.actualRevenue).slice(0, 6);
  const maxActual = topEmployees && topEmployees.length ? Math.max(...topEmployees.map((e) => e.actualRevenue), 1) : 1;

  const groupChartData = data?.byProductGroup.map((g) => ({
    name: `Nhóm hàng ${g.group}`,
    "Chỉ tiêu": g.targetRevenue,
    "Thực hiện": g.actualRevenue,
  }));

  const donutData = (data?.byProductGroup ?? [])
    .filter((g) => g.actualRevenue > 0)
    .map((g) => ({ name: g.group, value: g.actualRevenue }));

  const gaugeData = [{ name: "completion", value: Math.min(data?.completionPct ?? 0, 100), fill: "#E0A327" }];

  const insight = (() => {
    if (isLoading || !data) return null;
    const parts: string[] = [];
    if (data.completionPct != null) {
      parts.push(
        `Doanh số đang đạt ${data.completionPct}% kế hoạch tháng${
          data.actualTrendPct != null
            ? data.actualTrendPct >= 0
              ? `, tăng ${data.actualTrendPct}% so tháng trước`
              : `, giảm ${Math.abs(data.actualTrendPct)}% so tháng trước`
            : ""
        }`
      );
    }
    if (data.overdueOrderCount > 0) {
      parts.push(`${data.overdueOrderCount} đơn hàng đang quá hạn giao`);
    }
    if (isAdmin && data.debtOverdue) {
      parts.push(`công nợ quá hạn ${formatCurrencyVND(data.debtOverdue)}`);
    }
    if (parts.length === 0) return null;
    return parts.join(" · ") + ".";
  })();

  return (
    <div className="space-y-6">
      {/* Banner Gợi Ý Chiến Lược Kính Mờ (Smart Insight Banner) */}
      {insight && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-navy-900/80 to-navy-900/95 p-4 sm:p-5 shadow-[0_8px_30px_rgba(224,163,39,0.12)] backdrop-blur-2xl transition-all">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(224,163,39,0.25)]">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  GỢI Ý CHIẾN LƯỢC KINH DOANH
                </span>
                <Sparkles className="h-3 w-3 text-amber-400 animate-pulse" />
              </div>
              <p className="text-sm font-medium text-ink2 leading-relaxed">{insight}</p>
            </div>
          </div>
        </div>
      )}

      {/* 5 Thẻ KPI Glassmorphism Đầu Trang */}
      <div
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 gap-4",
          isAdmin ? "lg:grid-cols-5" : "lg:grid-cols-4"
        )}
      >
        {/* Card 1: Doanh số tháng này */}
        <div className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-gradient-to-br from-navy-900/90 via-gray-100/70 to-navy-900/90 p-5 shadow-card backdrop-blur-xl transition-all duration-300 hover:border-amber-500/40 hover:shadow-[0_8px_30px_rgba(224,163,39,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-ink2 uppercase">
              {isAdmin ? "Doanh số tháng này" : "Doanh số của bạn"}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(224,163,39,0.15)] group-hover:scale-110 transition-transform">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="font-mono text-2xl font-bold tracking-tight text-ink tabular-nums">
              {isLoading ? "—" : formatCurrencyVND(data?.totalActual ?? 0)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Theo giá trị đã giao trong tháng</p>
            <TrendLine delta={data?.actualTrendPct ?? null} unit="%" />
          </div>
        </div>

        {/* Card 2: Giá trị PO đặt hàng */}
        <div className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-gradient-to-br from-navy-900/90 via-gray-100/70 to-navy-900/90 p-5 shadow-card backdrop-blur-xl transition-all duration-300 hover:border-info-500/40 hover:shadow-[0_8px_30px_rgba(91,141,239,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-ink2 uppercase">
              {isAdmin ? "Giá trị PO đặt hàng" : "PO bạn đặt hàng"}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-info-500/10 border border-info-500/20 text-info-500 shadow-[0_0_12px_rgba(91,141,239,0.15)] group-hover:scale-110 transition-transform">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="font-mono text-2xl font-bold tracking-tight text-ink tabular-nums">
              {isLoading ? "—" : formatCurrencyVND(data?.totalPoValue ?? 0)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Theo ngày đặt hàng trong tháng</p>
            <TrendLine delta={data?.poTrendPct ?? null} unit="%" />
          </div>
        </div>

        {/* Card 3: % Hoàn thành kế hoạch */}
        <div className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-gradient-to-br from-navy-900/90 via-gray-100/70 to-navy-900/90 p-5 shadow-card backdrop-blur-xl transition-all duration-300 hover:border-success-600/40 hover:shadow-[0_8px_30px_rgba(34,179,120,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-ink2 uppercase">
              % Hoàn thành kế hoạch
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-600/10 border border-success-600/20 text-success-600 shadow-[0_0_12px_rgba(34,179,120,0.15)] group-hover:scale-110 transition-transform">
              <Target className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="font-mono text-2xl font-bold tracking-tight text-ink tabular-nums">
              {isLoading || data?.completionPct == null ? "—" : `${data.completionPct}%`}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Chỉ tiêu doanh thu toàn tháng</p>
            <TrendLine delta={data?.completionTrendPts ?? null} unit=" điểm" />
          </div>
        </div>

        {/* Card 4: Đơn hàng quá hạn */}
        <div
          className={cn(
            "group relative overflow-hidden rounded-2xl border p-5 shadow-card backdrop-blur-xl transition-all duration-300",
            data && data.overdueOrderCount > 0
              ? "border-brandRed-600/40 bg-gradient-to-br from-navy-900/90 via-brandRed-50/10 to-navy-900/90 hover:border-brandRed-600 hover:shadow-[0_8px_30px_rgba(200,16,46,0.18)]"
              : "border-gray-200/80 bg-gradient-to-br from-navy-900/90 via-gray-100/70 to-navy-900/90"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-ink2 uppercase">
              {isAdmin ? "Đơn hàng quá hạn" : "Đơn quá hạn của bạn"}
            </span>
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl border group-hover:scale-110 transition-transform",
                data && data.overdueOrderCount > 0
                  ? "bg-brandRed-50 border-brandRed-600/30 text-alert shadow-[0_0_12px_rgba(200,16,46,0.25)]"
                  : "bg-gray-100 border-gray-200 text-muted2"
              )}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={cn(
                "font-mono text-2xl font-bold tracking-tight tabular-nums",
                data && data.overdueOrderCount > 0 ? "text-alert" : "text-ink"
              )}
            >
              {isLoading ? "—" : data?.overdueOrderCount ?? 0}
            </span>
            {data && data.overdueOrderCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-brandRed-50 px-2 py-0.5 text-xs font-semibold text-alert border border-brandRed-600/20 animate-pulse">
                Cần giao ngay
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Đơn chưa hoàn tất quá ngày hẹn</p>
        </div>

        {/* Card 5: Công nợ quá hạn (ADMIN) */}
        {isAdmin && (
          <div
            className={cn(
              "group relative overflow-hidden rounded-2xl border p-5 shadow-card backdrop-blur-xl transition-all duration-300",
              data && (data.debtOverdue ?? 0) > 0
                ? "border-brandRed-600/40 bg-gradient-to-br from-navy-900/90 via-brandRed-50/10 to-navy-900/90 hover:border-brandRed-600 hover:shadow-[0_8px_30px_rgba(200,16,46,0.18)]"
                : "border-gray-200/80 bg-gradient-to-br from-navy-900/90 via-gray-100/70 to-navy-900/90"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-ink2 uppercase">
                Công nợ quá hạn
              </span>
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl border group-hover:scale-110 transition-transform",
                  data && (data.debtOverdue ?? 0) > 0
                    ? "bg-brandRed-50 border-brandRed-600/30 text-alert shadow-[0_0_12px_rgba(200,16,46,0.25)]"
                    : "bg-gray-100 border-gray-200 text-muted2"
                )}
              >
                <CreditCard className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p
                className={cn(
                  "font-mono text-2xl font-bold tracking-tight tabular-nums",
                  data && (data.debtOverdue ?? 0) > 0 ? "text-alert" : "text-ink"
                )}
              >
                {isLoading ? "—" : formatCurrencyVND(data?.debtOverdue ?? 0)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Hoá đơn đã vượt thời hạn thanh toán</p>
            </div>
          </div>
        )}
      </div>

      {/* Biểu Đồ Xu Hướng Lên Đơn (OrderTrendChart) */}
      <OrderTrendChart isAdmin={isAdmin} />

      {/* Khối Biểu Đồ Nhân Viên & Top Doanh Số */}
      {chartData && chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cột Trái: Kế hoạch vs Thực hiện theo nhân viên */}
          <div className="lg:col-span-2 rounded-2xl border border-gray-200/80 bg-navy-900/60 p-6 shadow-card backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-ink text-sm sm:text-base">
                    {isAdmin ? "Kế hoạch vs Thực hiện theo nhân viên" : "Kế hoạch vs Thực hiện của bạn"}
                  </h2>
                  <p className="text-[11px] text-muted2">{data ? `Thống kê tháng ${data.month}/${data.year}` : ""}</p>
                </div>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={290}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                <XAxis dataKey="name" tick={{ ...CHART_TICK, fontSize: 12 }} />
                <YAxis
                  tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}tr`}
                  tick={{ ...CHART_TICK, fontSize: 12 }}
                  width={50}
                />
                <Tooltip formatter={(v: number) => formatCurrencyVND(v)} contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend wrapperStyle={LEGEND_STYLE} />
                <Bar dataKey="Kế hoạch" fill="#E0A327" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Thực hiện" fill="#C8102E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Cột Phải: Top nhân viên theo doanh số */}
          {topEmployees && topEmployees.length > 0 && (
            <div className="rounded-2xl border border-gray-200/80 bg-navy-900/60 p-6 shadow-card backdrop-blur-xl">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Trophy className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-ink text-sm sm:text-base">Bảng xếp hạng NVKD</h2>
                  <p className="text-[11px] text-muted2">Top doanh số giao hàng trong tháng</p>
                </div>
              </div>

              <ul className="space-y-4">
                {topEmployees.map((e, i) => (
                  <li key={e.employeeId} className="group">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-mono font-bold",
                            i === 0
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              : i === 1
                              ? "bg-gray-200 text-gray-300 border border-gray-300"
                              : i === 2
                              ? "bg-amber-700/20 text-amber-600 border border-amber-700/30"
                              : "bg-navy-100 text-muted2"
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="font-medium text-ink truncate group-hover:text-amber-400 transition-colors">
                          {e.employeeName}
                        </span>
                      </div>
                      <span className="font-mono font-semibold text-ink shrink-0 ml-2">
                        {formatCurrencyVND(e.actualRevenue)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100/90 overflow-hidden p-0.5 border border-gray-200/40">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max((e.actualRevenue / maxActual) * 100, 3)}%`,
                          backgroundColor: RANK_COLORS[i % RANK_COLORS.length],
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Khối Nhóm Hàng & Gauge Hoàn Thành Kế Hoạch */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {groupChartData && groupChartData.length > 0 && (
          <div className="rounded-2xl border border-gray-200/80 bg-navy-900/60 p-6 shadow-card backdrop-blur-xl">
            <h2 className="font-semibold text-ink text-sm sm:text-base mb-1">
              Kế hoạch vs Thực hiện theo Nhóm hàng
            </h2>
            <p className="text-xs text-muted2 mb-4">Sản xuất vs Thương mại</p>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={groupChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                <XAxis dataKey="name" tick={{ ...CHART_TICK, fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}tr`} tick={{ ...CHART_TICK, fontSize: 11 }} width={48} />
                <Tooltip formatter={(v: number) => formatCurrencyVND(v)} contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="Chỉ tiêu" fill="#E0A327" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Thực hiện" fill="#C8102E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {donutData.length > 0 && (
          <div className="rounded-2xl border border-gray-200/80 bg-navy-900/60 p-6 shadow-card backdrop-blur-xl">
            <div className="flex items-center gap-2 mb-1">
              <PieChartIcon className="h-4 w-4 text-amber-400" />
              <h2 className="font-semibold text-ink text-sm sm:text-base">
                Tỷ trọng thực hiện theo Nhóm hàng
              </h2>
            </div>
            <p className="text-xs text-muted2 mb-4">Cơ cấu doanh thu thực tế</p>
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={3}>
                  {donutData.map((d) => (
                    <Cell key={d.name} fill={GROUP_COLORS[d.name] ?? "#5b6478"} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrencyVND(v)} contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend wrapperStyle={LEGEND_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Gauge Hoàn thành kế hoạch tháng */}
        <div className="rounded-2xl border border-gray-200/80 bg-navy-900/60 p-6 shadow-card backdrop-blur-xl flex flex-col justify-between">
          <div>
            <h2 className="font-semibold text-ink text-sm sm:text-base mb-1">
              Hoàn thành kế hoạch tháng
            </h2>
            <p className="text-xs text-muted2 mb-2">Tỷ lệ doanh thu đạt được so với mục tiêu</p>
          </div>
          <div className="relative flex items-center justify-center my-auto">
            <ResponsiveContainer width="100%" height={210}>
              <RadialBarChart
                data={gaugeData}
                startAngle={90}
                endAngle={-270}
                innerRadius="72%"
                outerRadius="100%"
              >
                <RadialBar dataKey="value" background={{ fill: "rgb(var(--c-gray-200))" }} cornerRadius={20} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-extrabold text-ink font-mono tabular-nums tracking-tight">
                {data?.completionPct != null ? `${data.completionPct}%` : "—"}
              </span>
              <span className="text-xs text-muted2 mt-1.5 font-mono">
                {formatCurrencyVND(data?.totalActual ?? 0)} / {formatCurrencyVND(data?.totalTarget ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Khối Đơn Hàng Quá Hạn & Công Nợ Quá Hạn */}
      <div className={cn("grid grid-cols-1 gap-6", isAdmin && "lg:grid-cols-2")}>
        {/* Đơn hàng quá hạn giao */}
        <div className="rounded-2xl border border-gray-200/80 bg-navy-900/60 p-6 shadow-card backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brandRed-50 border border-brandRed-600/30 text-alert shadow-[0_0_10px_rgba(200,16,46,0.2)]">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-semibold text-ink text-sm sm:text-base">
                  {isAdmin ? "Đơn hàng quá hạn giao" : "Đơn hàng của bạn quá hạn giao"}
                </h2>
                {data && data.overdueOrderCount > 0 && (
                  <p className="text-xs text-muted2">
                    Hiển thị {data.overdueOrders.length} trên tổng số {data.overdueOrderCount} đơn theo giá trị
                  </p>
                )}
              </div>
            </div>
          </div>

          {(!data || data.overdueOrders.length === 0) && (
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-sm font-medium text-ink">
                {isLoading ? "Đang tải dữ liệu đơn hàng..." : "Không có đơn hàng nào quá hạn giao 🎉"}
              </p>
            </div>
          )}

          <ul className="divide-y divide-gray-200/40 text-sm">
            {data?.overdueOrders.map((o) => (
              <li key={o.poCode} className="py-3 flex items-center justify-between gap-3 hover:bg-navy-50/40 rounded-lg px-2 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-navy-100 border border-gray-300 text-amber-400">
                      {o.poCode}
                    </span>
                  </div>
                  <p className="text-ink font-medium truncate text-xs sm:text-sm">{o.customerName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-alert font-mono font-bold text-sm">
                    {formatCurrencyVND(o.remainingValue)}
                  </p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Hạn: {formatDateVN(o.expectedDeliveryDate)}
                    {isAdmin && ` · ${o.salesEmployeeName ?? "—"}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {data && data.overdueOrders.length > 0 && (
            <Link
              href="/shipping-status"
              className="mt-4 flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
            >
              <span>Xem toàn bộ tại Tiến độ giao hàng</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {/* Khối Công nợ (ADMIN) */}
        {isAdmin && (
          <div className="rounded-2xl border border-gray-200/80 bg-navy-900/60 p-6 shadow-card backdrop-blur-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-info-500/10 border border-info-500/20 text-info-500">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-ink text-sm sm:text-base">Tổng hợp công nợ</h2>
                  <p className="text-xs text-muted2">Số liệu đồng bộ công nợ toàn phòng</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-xl border border-gray-200/70 bg-navy-50/60 p-4">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Tổng công nợ</p>
                  <p className="text-lg sm:text-xl font-bold text-ink font-mono tabular-nums mt-1">
                    {isLoading ? "—" : formatCurrencyVND(data?.debtTotal ?? 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-brandRed-600/30 bg-brandRed-50/20 p-4">
                  <p className="text-xs text-alert uppercase font-semibold">Quá hạn</p>
                  <p className="text-lg sm:text-xl font-bold text-alert font-mono tabular-nums mt-1">
                    {isLoading ? "—" : formatCurrencyVND(data?.debtOverdue ?? 0)}
                  </p>
                </div>
              </div>

              {(data?.debtPerEmployee?.length ?? 0) > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-ink mb-2">Theo từng nhân viên</p>
                  <div className="overflow-x-auto rounded-xl border border-gray-200/70">
                    <table className="min-w-full text-xs">
                      <thead className="bg-white/[0.04] text-muted-foreground">
                        <tr>
                          <th className="text-left font-medium px-3 py-2">Nhân viên</th>
                          <th className="text-right font-medium px-3 py-2">Tỉ lệ nợ quá hạn</th>
                          <th className="text-right font-medium px-3 py-2">
                            Thu hồi kế hoạch tuần
                            {data?.debtWeek && (
                              <span className="block font-normal text-[10px] text-muted2">
                                {formatDateVN(data.debtWeek.start)} – {formatDateVN(data.debtWeek.end)}
                              </span>
                            )}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {data?.debtPerEmployee?.map((e) => (
                          <tr key={e.employeeId ?? "none"}>
                            <td className="px-3 py-2 text-ink font-medium">{e.employeeName}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={cn("font-mono tabular-nums font-semibold", overdueRateColor(e.overdueRate))}>
                                {pct1(e.overdueRate)}
                              </span>
                              <span className="block text-[10px] text-muted2 font-mono">
                                {formatCurrencyVND(e.overdueDebt)} / {formatCurrencyVND(e.totalDebt)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={cn("font-mono tabular-nums font-semibold", collectRateColor(e.weekRate))}>
                                {pct1(e.weekRate)}
                              </span>
                              <span className="block text-[10px] text-muted2 font-mono">
                                {e.weekPlanned > 0 || e.weekCollected > 0
                                  ? `${formatCurrencyVND(e.weekCollected)} / ${formatCurrencyVND(e.weekPlanned)}`
                                  : "Chưa có kế hoạch thu"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground mb-4">
                Cập nhật lần cuối:{" "}
                <span className="text-ink font-medium">
                  {data?.debtUpdatedAt ? formatDateVN(data.debtUpdatedAt) : "Chưa có dữ liệu"}
                </span>
              </p>
            </div>

            <Link
              href="/debt"
              className="flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors pt-3 border-t border-gray-200/50"
            >
              <span>Xem chi tiết sổ theo dõi công nợ</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
