"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { cn, formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { AlertTriangle, Clock, TrendingUp, PackageCheck } from "lucide-react";

interface OrderRow {
  id: string;
  orderCode: string;
  customerName: string;
  salesEmployeeName: string | null;
  expectedDeliveryDate: string | null;
  totalValue: string;
  daysUntilDeadline: number | null;
  status: string;
}

interface EmployeeRow {
  employeeId: string;
  employeeName: string;
  openCount: number;
  overdueCount: number;
  upcomingCount: number;
}

interface SummaryResponse {
  openCount: number;
  overdueCount: number;
  overdueValue: number;
  upcomingCount: number;
  upcomingWindowDays: number;
  onTimeRatePct: number | null;
  rateWindowDays: number;
  byEmployee: EmployeeRow[];
  overdueOrders: OrderRow[];
  overdueOrdersTruncated: boolean;
  upcomingOrders: OrderRow[];
  upcomingOrdersTruncated: boolean;
}

export function ShippingStatusOverview({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<"overdue" | "upcoming">("overdue");

  const { data, isLoading } = useQuery({
    queryKey: ["shipping-status-summary"],
    queryFn: async () => {
      const res = await fetch("/api/shipping-status/summary");
      if (!res.ok) throw new Error("Không tải được tình hình giao hàng");
      return res.json() as Promise<SummaryResponse>;
    },
  });

  const rows = tab === "overdue" ? data?.overdueOrders : data?.upcomingOrders;
  const truncated = tab === "overdue" ? data?.overdueOrdersTruncated : data?.upcomingOrdersTruncated;
  const totalCount = tab === "overdue" ? data?.overdueCount : data?.upcomingCount;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card kpi-card--navy">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <TrendingUp className="h-4 w-4" /> Tỷ lệ giao đúng hạn ({data?.rateWindowDays ?? 90} ngày qua)
          </div>
          <p className="text-2xl font-bold text-navy-900 mt-1">
            {isLoading ? "—" : data?.onTimeRatePct != null ? `${data.onTimeRatePct}%` : "Chưa có dữ liệu"}
          </p>
        </div>
        <div className="kpi-card kpi-card--navy">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <PackageCheck className="h-4 w-4" /> Đơn hàng đang mở
          </div>
          <p className="text-2xl font-bold text-navy-900 mt-1">{isLoading ? "—" : data?.openCount}</p>
        </div>
        <div className="kpi-card kpi-card--red">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <AlertTriangle className="h-4 w-4" /> Quá hạn giao ({isLoading ? "—" : data?.overdueCount} đơn)
          </div>
          <p className="text-2xl font-bold text-brandRed-600 mt-1">
            {isLoading ? "—" : formatCurrencyVND(data?.overdueValue ?? 0)}
          </p>
        </div>
        <div className="kpi-card kpi-card--red">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <Clock className="h-4 w-4" /> Sắp đến hạn ({data?.upcomingWindowDays ?? 3} ngày tới)
          </div>
          <p className="text-2xl font-bold text-warning-500 mt-1">{isLoading ? "—" : data?.upcomingCount}</p>
        </div>
      </div>

      {isAdmin && data && data.byEmployee.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Nhân viên</th>
                <th className="text-right font-medium px-4 py-2.5">Đơn đang mở</th>
                <th className="text-right font-medium px-4 py-2.5">Quá hạn</th>
                <th className="text-right font-medium px-4 py-2.5">Sắp đến hạn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.byEmployee.map((e) => (
                <tr key={e.employeeId}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{e.employeeName}</td>
                  <td className="px-4 py-2.5 text-right">{e.openCount}</td>
                  <td className={cn("px-4 py-2.5 text-right", e.overdueCount > 0 && "text-brandRed-600 font-medium")}>
                    {e.overdueCount}
                  </td>
                  <td className={cn("px-4 py-2.5 text-right", e.upcomingCount > 0 && "text-warning-500 font-medium")}>
                    {e.upcomingCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setTab("overdue")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              tab === "overdue" ? "bg-brandRed-600 text-white" : "bg-white border border-gray-200 text-gray-700"
            )}
          >
            Quá hạn giao ({data?.overdueCount ?? 0})
          </button>
          <button
            onClick={() => setTab("upcoming")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              tab === "upcoming" ? "bg-warning-500 text-white" : "bg-white border border-gray-200 text-gray-700"
            )}
          >
            Sắp đến hạn ({data?.upcomingCount ?? 0})
          </button>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 sticky top-0">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Mã đơn</th>
                <th className="text-left font-medium px-4 py-2.5">Khách hàng</th>
                <th className="text-left font-medium px-4 py-2.5">NVKD</th>
                <th className="text-left font-medium px-4 py-2.5">Hạn giao</th>
                <th className="text-right font-medium px-4 py-2.5">
                  {tab === "overdue" ? "Số ngày quá hạn" : "Còn lại"}
                </th>
                <th className="text-right font-medium px-4 py-2.5">Giá trị</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!isLoading && (rows?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    {tab === "overdue" ? "Không có đơn quá hạn 🎉" : "Không có đơn sắp đến hạn"}
                  </td>
                </tr>
              )}
              {rows?.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-navy-900">
                    <Link href={`/orders/${o.id}`}>{o.orderCode}</Link>
                  </td>
                  <td className="px-4 py-2.5">{o.customerName}</td>
                  <td className="px-4 py-2.5">{o.salesEmployeeName ?? "—"}</td>
                  <td className="px-4 py-2.5">{formatDateVN(o.expectedDeliveryDate)}</td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-medium",
                      tab === "overdue" ? "text-brandRed-600" : "text-warning-500"
                    )}
                  >
                    {o.daysUntilDeadline != null
                      ? tab === "overdue"
                        ? `${Math.abs(o.daysUntilDeadline)} ngày`
                        : o.daysUntilDeadline === 0
                        ? "Hôm nay"
                        : `${o.daysUntilDeadline} ngày`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">{formatCurrencyVND(o.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {truncated && (
          <p className="text-xs text-gray-500 mt-2">
            Đang hiển thị {rows?.length} / {totalCount} đơn (ưu tiên các đơn quá hạn lâu nhất) — xem bảng theo
            nhân viên phía trên để biết số lượng chính xác của từng người.
          </p>
        )}
      </div>
    </div>
  );
}
