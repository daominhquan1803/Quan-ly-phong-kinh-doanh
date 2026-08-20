"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryResponse {
  totalTarget: number;
  totalActual: number;
  completionPct: number | null;
  perEmployee: {
    employeeId: string;
    employeeName: string;
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
}

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

  return (
    <div className="space-y-6">
      <div
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 gap-4",
          isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"
        )}
      >
        <div className="kpi-card kpi-card--navy">
          <p className="text-sm text-gray-500">{isAdmin ? "Doanh số tháng này" : "Doanh số của bạn tháng này"}</p>
          <p className="text-2xl font-bold text-navy-900 mt-1">
            {isLoading ? "—" : formatCurrencyVND(data?.totalActual ?? 0)}
          </p>
        </div>
        <div className="kpi-card kpi-card--navy">
          <p className="text-sm text-gray-500">% hoàn thành kế hoạch</p>
          <p className="text-2xl font-bold text-navy-900 mt-1">
            {isLoading || data?.completionPct == null ? "—" : `${data.completionPct}%`}
          </p>
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
          </div>
        )}
      </div>

      {chartData && chartData.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="font-medium text-gray-900 mb-4">
            {isAdmin ? "Kế hoạch vs Thực hiện theo nhân viên" : "Kế hoạch vs Thực hiện của bạn"}
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E6ED" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}tr`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => formatCurrencyVND(v)} />
              <Legend />
              <Bar dataKey="Kế hoạch" fill="#0B2447" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Thực hiện" fill="#C8102E" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

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
