"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { cn, formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { normalizeVN } from "@/lib/text-normalize";
import { EmployeeFilterSelect } from "@/components/shared/EmployeeFilterSelect";
import { FilterInput, SortableTh, toggleSort, type SortState } from "@/components/shared/SortableFilterableTable";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PackageCheck,
  RefreshCw,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";

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
  salesEmployeeName: string | null;
  expectedDeliveryDate: string | null;
  // Giá trị còn lại chưa giao (đã trừ phần đã giao nếu đơn giao 1 phần) — không phải tổng
  // giá trị đơn.
  remainingValue: string;
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

type SortField = "expectedDeliveryDate" | "daysUntilDeadline" | "remainingValue";

export function ShippingStatusOverview({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<"overdue" | "upcoming">("overdue");
  const [employeeId, setEmployeeId] = useState("");
  const [filterOrderCode, setFilterOrderCode] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterEmployeeName, setFilterEmployeeName] = useState("");
  const [sort, setSort] = useState<SortState<SortField>>({ field: null, dir: "asc" });
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["shipping-status-summary", employeeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeId) params.set("employeeId", employeeId);
      const res = await fetch(`/api/shipping-status/summary?${params.toString()}`);
      if (!res.ok) throw new Error("Không tải được tình hình giao hàng");
      return res.json() as Promise<SummaryResponse>;
    },
  });

  // Đơn hàng đồng bộ tự động từ AMIS 1 lần/ngày (06:00) — nút này để đồng bộ thủ công ngay
  // khi cần, không phải đợi lịch. Dùng chung API/trạng thái với trang Đơn hàng.
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
        queryClient.invalidateQueries({ queryKey: ["shipping-status-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["orders-sync-status"] }),
      ]);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSyncing(false);
    }
  }

  const rows = tab === "overdue" ? data?.overdueOrders : data?.upcomingOrders;
  const totalCount = tab === "overdue" ? data?.overdueCount : data?.upcomingCount;

  const hasActiveFilter = !!(filterOrderCode || filterCustomer || filterEmployeeName);

  const visibleRows = useMemo(() => {
    let list = rows ?? [];
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
      list = list.filter((o) => normalizeVN(o.salesEmployeeName ?? "").includes(q));
    }
    if (sort.field) {
      const field = sort.field;
      const dir = sort.dir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const av =
          field === "expectedDeliveryDate"
            ? a.expectedDeliveryDate
              ? new Date(a.expectedDeliveryDate).getTime()
              : -Infinity
            : field === "daysUntilDeadline"
            ? Math.abs(a.daysUntilDeadline ?? 0)
            : Number(a.remainingValue);
        const bv =
          field === "expectedDeliveryDate"
            ? b.expectedDeliveryDate
              ? new Date(b.expectedDeliveryDate).getTime()
              : -Infinity
            : field === "daysUntilDeadline"
            ? Math.abs(b.daysUntilDeadline ?? 0)
            : Number(b.remainingValue);
        return (av - bv) * dir;
      });
    }
    return list;
  }, [rows, filterOrderCode, filterCustomer, filterEmployeeName, sort]);

  function handleSort(field: SortField) {
    setSort((prev) => toggleSort(prev, field));
  }

  function clearFilters() {
    setFilterOrderCode("");
    setFilterCustomer("");
    setFilterEmployeeName("");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {syncData?.lastSync && (
            <>
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
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={handleSyncAmis}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-md bg-navy-900 px-3 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "Đang đồng bộ..." : "Đồng bộ AMIS"}
            </button>
          )}
          {isAdmin && <EmployeeFilterSelect value={employeeId} onChange={setEmployeeId} />}
        </div>
      </div>
      {syncError && <div className="rounded-md bg-brandRed-50 text-brandRed-600 text-sm px-4 py-2.5">{syncError}</div>}

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
            <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Mã đơn</th>
                <th className="text-left font-medium px-4 py-2.5">Khách hàng</th>
                <th className="text-left font-medium px-4 py-2.5">NVKD</th>
                <SortableTh field="expectedDeliveryDate" sort={sort} onSort={handleSort}>
                  Hạn giao
                </SortableTh>
                <SortableTh field="daysUntilDeadline" sort={sort} onSort={handleSort} align="right">
                  {tab === "overdue" ? "Số ngày quá hạn" : "Còn lại"}
                </SortableTh>
                <SortableTh field="remainingValue" sort={sort} onSort={handleSort} align="right">
                  Giá trị còn lại
                </SortableTh>
              </tr>
              <tr className="bg-white border-t border-gray-100">
                <th className="px-4 py-2 font-normal">
                  <FilterInput value={filterOrderCode} onChange={setFilterOrderCode} placeholder="Tìm mã đơn..." />
                </th>
                <th className="px-4 py-2 font-normal">
                  <FilterInput value={filterCustomer} onChange={setFilterCustomer} placeholder="Tìm khách hàng..." />
                </th>
                <th className="px-4 py-2 font-normal">
                  <FilterInput value={filterEmployeeName} onChange={setFilterEmployeeName} placeholder="Tìm NVKD..." />
                </th>
                <th colSpan={3} className="px-4 py-2 text-right">
                  {hasActiveFilter && (
                    <button
                      onClick={clearFilters}
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brandRed-600"
                    >
                      <X className="h-3 w-3" /> Xoá lọc
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!isLoading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    {hasActiveFilter
                      ? "Không tìm thấy đơn phù hợp"
                      : tab === "overdue"
                      ? "Không có đơn quá hạn 🎉"
                      : "Không có đơn sắp đến hạn"}
                  </td>
                </tr>
              )}
              {visibleRows.map((o) => (
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
                  <td className="px-4 py-2.5 text-right">{formatCurrencyVND(o.remainingValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasActiveFilter && !isLoading && (
          <p className="text-xs text-gray-500 mt-2">
            Đang hiển thị {visibleRows.length} / {totalCount ?? 0} đơn theo bộ lọc hiện tại.
          </p>
        )}
      </div>
    </div>
  );
}
