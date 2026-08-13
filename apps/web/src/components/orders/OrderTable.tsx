"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OrderStatusBadge } from "./StatusBadge";
import { cn, formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { Search, Upload, RefreshCw, CheckCircle2, XCircle } from "lucide-react";

interface SyncLog {
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: string;
  message: string | null;
  recordsSynced: number | null;
}

interface OrderRow {
  id: string;
  orderCode: string;
  customerName: string;
  salesEmployee: { id: string; name: string } | null;
  salesEmployeeNameRaw: string | null;
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
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const queryClient = useQueryClient();

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

  const { data: syncData } = useQuery({
    queryKey: ["orders-sync-status"],
    queryFn: async () => {
      const res = await fetch("/api/orders/sync");
      if (!res.ok) throw new Error("Không tải được trạng thái đồng bộ");
      return res.json() as Promise<{ lastSync: SyncLog | null }>;
    },
    refetchInterval: 30_000,
  });

  async function handleSyncAmis() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/orders/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Đồng bộ thất bại");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["orders-sync-status"] }),
      ]);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSyncing(false);
    }
  }

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
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncAmis}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-md bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "Đang đồng bộ..." : "Đồng bộ AMIS"}
            </button>
            <Link
              href="/orders/import"
              className="flex items-center gap-1.5 rounded-md bg-brandRed-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brandRed-700"
            >
              <Upload className="h-4 w-4" />
              Nhập Excel từ AMIS
            </Link>
          </div>
        )}
      </div>

      {syncError && <div className="rounded-md bg-brandRed-50 text-brandRed-600 text-sm px-4 py-2.5">{syncError}</div>}

      {syncData?.lastSync && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {syncData.lastSync.status === "SUCCESS" ? (
            <CheckCircle2 className="h-4 w-4 text-success-600" />
          ) : syncData.lastSync.status === "FAILED" ? (
            <XCircle className="h-4 w-4 text-brandRed-600" />
          ) : (
            <RefreshCw className="h-4 w-4 animate-spin" />
          )}
          Đồng bộ AMIS gần nhất: {formatDateVN(syncData.lastSync.startedAt)}
          {syncData.lastSync.recordsSynced != null && ` — ${syncData.lastSync.recordsSynced} đơn`}
          {syncData.lastSync.status === "FAILED" && syncData.lastSync.message && (
            <span className="text-brandRed-600">— {syncData.lastSync.message}</span>
          )}
          {syncData.lastSync.status === "SUCCESS" && syncData.lastSync.message && (
            <span className="text-warning-500">— {syncData.lastSync.message}</span>
          )}
        </div>
      )}

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
                <td className="px-4 py-2.5">{o.salesEmployee?.name ?? o.salesEmployeeNameRaw ?? "—"}</td>
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
