"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OrderStatusBadge } from "./StatusBadge";
import { cn, formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { normalizeVN } from "@/lib/text-normalize";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { EmployeeFilterSelect } from "@/components/shared/EmployeeFilterSelect";
import { FilterInput, SortableTh, toggleSort, type SortState } from "@/components/shared/SortableFilterableTable";
import { Upload, RefreshCw, CheckCircle2, XCircle, X } from "lucide-react";

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

function employeeDisplayName(o: OrderRow): string {
  return o.salesEmployee?.name ?? o.salesEmployeeNameRaw ?? "";
}

type SortField = "orderDate" | "expectedDeliveryDate" | "totalValue";

export function OrderTable({ isAdmin }: { isAdmin: boolean }) {
  const [status, setStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [filterOrderCode, setFilterOrderCode] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterEmployeeName, setFilterEmployeeName] = useState("");
  const [sort, setSort] = useState<SortState<SortField>>({ field: null, dir: "asc" });
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["orders", status, overdueOnly, employeeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (overdueOnly) params.set("overdue", "1");
      if (employeeId) params.set("employeeId", employeeId);
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

  const hasActiveFilter = !!(filterOrderCode || filterCustomer || filterEmployeeName);

  const visibleOrders = useMemo(() => {
    let list = data?.orders ?? [];
    if (filterOrderCode.trim()) {
      const q = normalizeVN(filterOrderCode);
      list = list.filter((o) => normalizeVN(o.orderCode).includes(q));
    }
    if (filterCustomer.trim()) {
      const q = normalizeVN(filterCustomer);
      list = list.filter((o) => normalizeVN(o.customerName).includes(q));
    }
    if (filterEmployeeName.trim()) {
      const q = normalizeVN(filterEmployeeName);
      list = list.filter((o) => normalizeVN(employeeDisplayName(o)).includes(q));
    }
    if (sort.field) {
      const field = sort.field;
      const dir = sort.dir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const av = field === "totalValue" ? Number(a.totalValue) : a[field] ? new Date(a[field] as string).getTime() : -Infinity;
        const bv = field === "totalValue" ? Number(b.totalValue) : b[field] ? new Date(b[field] as string).getTime() : -Infinity;
        return (av - bv) * dir;
      });
    }
    return list;
  }, [data, filterOrderCode, filterCustomer, filterEmployeeName, sort]);

  function handleSort(field: SortField) {
    setSort((prev) => toggleSort(prev, field));
  }

  function clearFilters() {
    setFilterOrderCode("");
    setFilterCustomer("");
    setFilterEmployeeName("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm bg-card text-ink rounded-md border border-gray-200 py-2 px-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-ink2">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
            Chỉ đơn quá hạn
          </label>
          {isAdmin && <EmployeeFilterSelect value={employeeId} onChange={setEmployeeId} />}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncAmis}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-60"
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
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

      <div className="rounded-lg border border-gray-200 bg-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Mã đơn</th>
              <th className="text-left font-medium px-4 py-2.5">Khách hàng</th>
              <th className="text-left font-medium px-4 py-2.5">NVKD</th>
              <SortableTh field="orderDate" sort={sort} onSort={handleSort}>
                Ngày đặt
              </SortableTh>
              <SortableTh field="expectedDeliveryDate" sort={sort} onSort={handleSort}>
                Giao dự kiến
              </SortableTh>
              <th className="text-left font-medium px-4 py-2.5">Trạng thái</th>
              <SortableTh field="totalValue" sort={sort} onSort={handleSort} align="right">
                Giá trị
              </SortableTh>
            </tr>
            <tr className="bg-card border-t border-gray-100">
              <th className="px-4 py-2 font-normal">
                <FilterInput value={filterOrderCode} onChange={setFilterOrderCode} placeholder="Tìm mã đơn..." />
              </th>
              <th className="px-4 py-2 font-normal">
                <FilterInput value={filterCustomer} onChange={setFilterCustomer} placeholder="Tìm khách hàng..." />
              </th>
              <th className="px-4 py-2 font-normal">
                <FilterInput value={filterEmployeeName} onChange={setFilterEmployeeName} placeholder="Tìm NVKD..." />
              </th>
              <th colSpan={4} className="px-4 py-2 text-right">
                {hasActiveFilter && (
                  <button
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brandRed-600"
                  >
                    <X className="h-3 w-3" /> Xoá lọc
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Đang tải...
                </td>
              </tr>
            )}
            {!isLoading && visibleOrders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  {hasActiveFilter ? "Không tìm thấy đơn phù hợp" : "Chưa có đơn hàng nào."}
                </td>
              </tr>
            )}
            {visibleOrders.map((o) => (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-ink">
                  <Link href={`/orders/${o.id}`}>{o.orderCode}</Link>
                </td>
                <td className="px-4 py-2.5">{o.customerName}</td>
                <td className="px-4 py-2.5">{employeeDisplayName(o) || "—"}</td>
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
      {hasActiveFilter && !isLoading && (
        <p className="text-xs text-muted-foreground">
          Đang hiển thị {visibleOrders.length} / {data?.orders.length ?? 0} đơn theo bộ lọc hiện tại.
        </p>
      )}
    </div>
  );
}
