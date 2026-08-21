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
import { AlertTriangle, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

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
    id: string;
    orderCode: string;
    customerName: string;
    salesEmployeeName: string | null;
    expectedDeliveryDate: string | null;
  }[];
  // null cho nhân viên kinh doanh — công nợ là số liệu tổng cả phòng, chỉ ADMIN xem được.
  debtTotal: number | null;
  debtOverdue: number | null;
  debtSnapshotDate: string | null;
  debtTrendPct: number | null;
}

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
  const color = delta === 0 ? "text-gray-400" : isGood ? "text-success-600" : "text-brandRed-600";
  return (
    <p className={cn("text-xs mt-1.5 flex items-center gap-1", color)}>
      <Icon className="h-3 w-3 shrink-0" />
      {delta > 0 ? "+" : ""}
      {delta}
      {unit} so với tháng trước
    </p>
  );
}

const RANK_COLORS = ["#0B2447", "#C8102E", "#2F6FED", "#D4A017", "#1E9E63", "#123A6B"];
const GROUP_COLORS: Record<string, string> = {
  "Sản xuất": "#0B2447",
  "Thương mại": "#C8102E",
  Khác: "#6B7280",
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

  const gaugeData = [{ name: "completion", value: Math.min(data?.completionPct ?? 0, 100), fill: "#0B2447" }];

  return (
    <div className="space-y-6">
      <div
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 gap-4",
          isAdmin ? "lg:grid-cols-5" : "lg:grid-cols-4"
        )}
      >
        <div className="kpi-card kpi-card--navy">
          <p className="text-sm text-gray-500">{isAdmin ? "Doanh số tháng này" : "Doanh số của bạn tháng này"}</p>
          <p className="text-2xl font-bold text-navy-900 mt-1">
            {isLoading ? "—" : formatCurrencyVND(data?.totalActual ?? 0)}
          </p>
          <p className="text-xs text-gray-400 mt-1">Theo giá trị đã giao trong tháng</p>
          <TrendLine delta={data?.actualTrendPct ?? null} unit="%" />
        </div>
        <div className="kpi-card kpi-card--navy">
          <p className="text-sm text-gray-500">{isAdmin ? "Giá trị PO đặt hàng" : "Giá trị PO bạn đặt hàng"}</p>
          <p className="text-2xl font-bold text-navy-900 mt-1">
            {isLoading ? "—" : formatCurrencyVND(data?.totalPoValue ?? 0)}
          </p>
          <p className="text-xs text-gray-400 mt-1">Theo ngày đặt hàng trong tháng</p>
          <TrendLine delta={data?.poTrendPct ?? null} unit="%" />
        </div>
        <div className="kpi-card kpi-card--navy">
          <p className="text-sm text-gray-500">% hoàn thành kế hoạch</p>
          <p className="text-2xl font-bold text-navy-900 mt-1">
            {isLoading || data?.completionPct == null ? "—" : `${data.completionPct}%`}
          </p>
          <TrendLine delta={data?.completionTrendPts ?? null} unit=" điểm" />
        </div>
        <div className="kpi-card kpi-card--red">
          <p className="text-sm text-gray-500">{isAdmin ? "Đơn hàng quá hạn" : "Đơn hàng quá hạn của bạn"}</p>
          <p className="text-2xl font-bold text-brandRed-600 mt-1">{isLoading ? "—" : data?.overdueOrderCount ?? 0}</p>
        </div>
        {isAdmin && (
          <div className="kpi-card kpi-card--red">
            <p className="text-sm text-gray-500">Công nợ quá hạn</p>
            <p className="text-2xl font-bold text-brandRed-600 mt-1">
              {isLoading ? "—" : formatCurrencyVND(data?.debtOverdue ?? 0)}
            </p>
            <TrendLine delta={data?.debtTrendPct ?? null} unit="%" invert />
          </div>
        )}
      </div>

      {chartData && chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="font-medium text-gray-900">
              {isAdmin ? "Kế hoạch vs Thực hiện theo nhân viên" : "Kế hoạch vs Thực hiện của bạn"}
            </h2>
            <p className="text-xs text-gray-400 mb-4">{data ? `Tháng ${data.month}/${data.year}` : ""}</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E6ED" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}tr`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatCurrencyVND(v)} />
                <Legend />
                <Bar dataKey="Kế hoạch" fill="#0B2447" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Thực hiện" fill="#C8102E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {topEmployees && topEmployees.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="font-medium text-gray-900 mb-4">Top nhân viên theo doanh số</h2>
              <ul className="space-y-4">
                {topEmployees.map((e, i) => (
                  <li key={e.employeeId}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium text-gray-900 truncate">{e.employeeName}</span>
                      <span className="text-gray-500 shrink-0 ml-2">{formatCurrencyVND(e.actualRevenue)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max((e.actualRevenue / maxActual) * 100, 2)}%`,
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {groupChartData && groupChartData.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="font-medium text-gray-900 mb-4">Kế hoạch vs Thực hiện theo Nhóm hàng</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={groupChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E6ED" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}tr`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrencyVND(v)} />
                <Bar dataKey="Chỉ tiêu" fill="#0B2447" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Thực hiện" fill="#C8102E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {donutData.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="font-medium text-gray-900 mb-4">Tỷ trọng thực hiện theo Nhóm hàng</h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                  {donutData.map((d) => (
                    <Cell key={d.name} fill={GROUP_COLORS[d.name] ?? "#6B7280"} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrencyVND(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="font-medium text-gray-900 mb-2">Hoàn thành kế hoạch tháng</h2>
          <div className="relative">
            <ResponsiveContainer width="100%" height={220}>
              <RadialBarChart
                data={gaugeData}
                startAngle={90}
                endAngle={-270}
                innerRadius="70%"
                outerRadius="100%"
              >
                <RadialBar dataKey="value" background={{ fill: "#EDF1F7" }} cornerRadius={20} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-navy-900">
                {data?.completionPct != null ? `${data.completionPct}%` : "—"}
              </span>
              <span className="text-xs text-gray-400 mt-1">
                {formatCurrencyVND(data?.totalActual ?? 0)} / {formatCurrencyVND(data?.totalTarget ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={cn("grid grid-cols-1 gap-6", isAdmin && "lg:grid-cols-2")}>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-brandRed-600" />
            <h2 className="font-medium text-gray-900">
              {isAdmin ? "Đơn hàng quá hạn giao" : "Đơn hàng của bạn quá hạn giao"}
            </h2>
          </div>
          {(!data || data.overdueOrders.length === 0) && (
            <p className="text-sm text-gray-500">{isLoading ? "Đang tải..." : "Không có đơn hàng quá hạn 🎉"}</p>
          )}
          <ul className="divide-y divide-gray-100 text-sm">
            {data?.overdueOrders.map((o) => (
              <li key={o.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/orders/${o.id}`} className="font-medium text-navy-900">
                    {o.orderCode}
                  </Link>
                  <p className="text-gray-500 truncate">{o.customerName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-brandRed-600 font-medium">{formatDateVN(o.expectedDeliveryDate)}</p>
                  {isAdmin && <p className="text-gray-500 text-xs">{o.salesEmployeeName ?? "—"}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {isAdmin && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="font-medium text-gray-900 mb-3">Công nợ</h2>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <p className="text-sm text-gray-500">Tổng công nợ</p>
                <p className="text-lg font-bold text-navy-900">{isLoading ? "—" : formatCurrencyVND(data?.debtTotal ?? 0)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Quá hạn</p>
                <p className="text-lg font-bold text-brandRed-600">{isLoading ? "—" : formatCurrencyVND(data?.debtOverdue ?? 0)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Cập nhật lần cuối: {data?.debtSnapshotDate ? formatDateVN(data.debtSnapshotDate) : "chưa có dữ liệu"}
            </p>
            <Link href="/debt" className="text-sm text-navy-900 hover:underline">
              Xem chi tiết công nợ →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
