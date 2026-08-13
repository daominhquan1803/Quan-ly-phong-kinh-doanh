"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { OrderStatusBadge } from "./StatusBadge";
import { formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { Search, Upload } from "lucide-react";

interface OrderRow {
  id: string;
  orderCode: string;
  customerName: string;
  salesEmployee: { id: string; name: string } | null;
  orderDate: string | null;
  expectedDeliveryDate: string | null;
  status: string;
  totalValue: string;
  poCode: string | null;
}

function isOverdue(o: OrderRow) {
  if (!o.expectedDeliveryDate) return false;
  if (["DELIVERED", "CANCELLED"].includes(o.status)) return false;
  return new Date(o.expectedDeliveryDate).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
}

export function OrderTable({ isAdmin }: { isAdmin: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["orders", q, status, overdueOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      if (overdueOnly) params.set("overdue", "1");
      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error("Không tải được đơn hàng");
      return res.json() as Promise<{ orders: OrderRow[] }>;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm mã đơn, khách hàng, PO..."
              className="pl-8 pr-3 py-2 text-sm rounded-md border border-gray-200 w-64 focus:outline-none focus:ring-2 focus:ring-navy-900"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm rounded-md border border-gray-200 py-2 px-2 focus:outline-none focus:ring-2 focus:ring-navy-900"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
            Chỉ đơn quá hạn
          </label>
        </div>
        {isAdmin && (
          <Link
            href="/orders/import"
            className="flex items-center gap-1.5 rounded-md bg-brandRed-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brandRed-700"
          >
            <Upload className="h-4 w-4" />
            Nhập Excel từ AMIS
          </Link>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Mã đơn</th>
              <th className="text-left font-medium px-4 py-2.5">Khách hàng</th>
              <th className="text-left font-medium px-4 py-2.5">NVKD</th>
              <th className="text-left font-medium px-4 py-2.5">Ngày đặt</th>
              <th className="text-left font-medium px-4 py-2.5">Giao dự kiến</th>
              <th className="text-left font-medium px-4 py-2.5">Trạng thái</th>
              <th className="text-right font-medium px-4 py-2.5">Giá trị</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Đang tải...
                </td>
              </tr>
            )}
            {!isLoading && (data?.orders.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Chưa có đơn hàng nào.
                </td>
              </tr>
            )}
            {data?.orders.map((o) => (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-navy-900">
                  <Link href={`/orders/${o.id}`}>{o.orderCode}</Link>
                </td>
                <td className="px-4 py-2.5">{o.customerName}</td>
                <td className="px-4 py-2.5">{o.salesEmployee?.name ?? "—"}</td>
                <td className="px-4 py-2.5">{formatDateVN(o.orderDate)}</td>
                <td className="px-4 py-2.5">{formatDateVN(o.expectedDeliveryDate)}</td>
                <td className="px-4 py-2.5">
                  <OrderStatusBadge status={o.status} overdue={isOverdue(o)} />
                </td>
                <td className="px-4 py-2.5 text-right">{formatCurrencyVND(o.totalValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
