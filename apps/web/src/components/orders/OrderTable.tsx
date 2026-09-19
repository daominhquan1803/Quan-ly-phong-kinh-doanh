"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OrderStatusBadge } from "./StatusBadge";
import { cn, formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { normalizeVN } from "@/lib/text-normalize";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { EmployeeFilterSelect } from "@/components/shared/EmployeeFilterSelect";
import { FilterInput, SortableTh, toggleSort, type SortState } from "@/components/shared/SortableFilterableTable";
import { CustomerRiskPanel } from "@/components/orders/CustomerRiskPanel";
import { Upload, RefreshCw, CheckCircle2, XCircle, X, FilePlus2, ChevronLeft, ChevronRight, ShoppingCart, Filter } from "lucide-react";

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
  const [sort, setSort] = useState<SortState<SortField>>({ field: "orderDate", dir: "desc" });
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const PAGE_SIZE = 15;

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
      const valueOf = (o: OrderRow): number | null => {
        if (field === "totalValue") return Number(o.totalValue);
        const raw = o[field];
        return raw ? new Date(raw as string).getTime() : null;
      };
      list = [...list].sort((a, b) => {
        const av = valueOf(a);
        const bv = valueOf(b);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      });
    }
    return list;
  }, [data, filterOrderCode, filterCustomer, filterEmployeeName, sort]);

  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedOrders = visibleOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [status, overdueOnly, employeeId, filterOrderCode, filterCustomer, filterEmployeeName, sort]);

  function handleSort(field: SortField) {
    setSort((prev) => toggleSort(prev, field));
  }

  function clearFilters() {
    setFilterOrderCode("");
    setFilterCustomer("");
    setFilterEmployeeName("");
  }

  return (
    <div className="space-y-5">
      {/* Cảnh báo khách có nguy cơ mất */}
      <CustomerRiskPanel employeeId={isAdmin ? employeeId : ""} />

      {/* Thanh Điều Khiển Toolbar Glassmorphism */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200/80 bg-navy-900/60 p-4 shadow-card backdrop-blur-xl">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-xs bg-navy-50/80 text-ink rounded-xl border border-gray-200/90 py-2.5 px-3 focus:outline-none focus:border-amber-500"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-xs font-medium text-ink cursor-pointer rounded-xl border border-gray-200/80 bg-navy-50/80 px-3 py-2 hover:border-amber-500/40 transition-colors">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="rounded accent-amber-500"
            />
            <span>Chỉ đơn quá hạn</span>
          </label>

          {isAdmin && <EmployeeFilterSelect value={employeeId} onChange={setEmployeeId} />}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {isAdmin && (
            <>
              <button
                onClick={handleSyncAmis}
                disabled={syncing}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-amber-foreground shadow-[0_0_15px_rgba(224,163,39,0.25)] hover:bg-amber-400 disabled:opacity-50 transition-all"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
                {syncing ? "Đang đồng bộ..." : "Đồng bộ AMIS"}
              </button>
              <Link
                href="/orders/import"
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brandRed-600 to-brandRed-700 px-4 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(200,16,46,0.35)] hover:from-brandRed-700 hover:to-brandRed-800 transition-all"
              >
                <Upload className="h-3.5 w-3.5" />
                Nhập Excel AMIS
              </Link>
            </>
          )}
          <Link
            href="/orders/manual"
            className="flex items-center gap-1.5 rounded-xl border border-gray-200/90 bg-navy-50/70 px-4 py-2 text-xs font-medium text-ink hover:border-gray-300 hover:bg-navy-50 transition-all shadow-sm"
          >
            <FilePlus2 className="h-3.5 w-3.5 text-info-500" />
            Thêm đơn thủ công
          </Link>
        </div>
      </div>

      {syncError && (
        <div className="rounded-xl border border-brandRed-600/40 bg-brandRed-50/20 p-4 text-xs font-medium text-alert backdrop-blur-md flex items-center gap-2">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{syncError}</span>
        </div>
      )}

      {syncData?.lastSync && (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200/60 bg-navy-900/40 px-4 py-2 text-xs text-muted-foreground backdrop-blur-sm">
          {syncData.lastSync.status === "SUCCESS" ? (
            <CheckCircle2 className="h-4 w-4 text-success-600" />
          ) : syncData.lastSync.status === "FAILED" ? (
            <XCircle className="h-4 w-4 text-alert" />
          ) : (
            <RefreshCw className="h-4 w-4 animate-spin text-amber-500" />
          )}
          <span>Đồng bộ AMIS gần nhất: <strong className="text-ink">{formatDateVN(syncData.lastSync.startedAt)}</strong></span>
          {syncData.lastSync.recordsSynced != null && (
            <span className="font-mono text-ink"> — {syncData.lastSync.recordsSynced} đơn</span>
          )}
          {syncData.lastSync.status === "FAILED" && syncData.lastSync.message && (
            <span className="text-alert">— {syncData.lastSync.message}</span>
          )}
          {syncData.lastSync.status === "SUCCESS" && syncData.lastSync.message && (
            <span className="text-warning-500">— {syncData.lastSync.message}</span>
          )}
        </div>
      )}

      {/* Bảng Dữ Liệu Đơn Hàng Glassmorphism */}
      <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-navy-900/50 shadow-card backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200/80 bg-gray-50/90 text-xs font-semibold uppercase tracking-wider text-ink2/70">
                <th className="px-5 py-3.5 text-left w-36">Mã đơn</th>
                <th className="px-5 py-3.5 text-left min-w-[240px]">Khách hàng</th>
                <th className="px-5 py-3.5 text-left w-48">NVKD</th>
                <SortableTh field="orderDate" sort={sort} onSort={handleSort}>
                  Ngày đặt
                </SortableTh>
                <SortableTh field="expectedDeliveryDate" sort={sort} onSort={handleSort}>
                  Giao dự kiến
                </SortableTh>
                <th className="px-5 py-3.5 text-left w-40">Trạng thái</th>
                <SortableTh field="totalValue" sort={sort} onSort={handleSort} align="right">
                  Giá trị đơn
                </SortableTh>
              </tr>
              {/* Hàng Tìm Kiếm Nhanh */}
              <tr className="bg-navy-900/80 border-b border-gray-200/60">
                <th className="px-5 py-2 font-normal">
                  <FilterInput value={filterOrderCode} onChange={setFilterOrderCode} placeholder="Lọc mã đơn..." />
                </th>
                <th className="px-5 py-2 font-normal">
                  <FilterInput value={filterCustomer} onChange={setFilterCustomer} placeholder="Lọc khách hàng..." />
                </th>
                <th className="px-5 py-2 font-normal">
                  <FilterInput value={filterEmployeeName} onChange={setFilterEmployeeName} placeholder="Lọc NVKD..." />
                </th>
                <th colSpan={4} className="px-5 py-2 text-right">
                  {hasActiveFilter && (
                    <button
                      onClick={clearFilters}
                      className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20"
                    >
                      <X className="h-3 w-3" /> Xoá bộ lọc
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/40 text-sm">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                    Đang tải dữ liệu đơn hàng...
                  </td>
                </tr>
              )}
              {!isLoading && visibleOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                    <ShoppingCart className="h-8 w-8 text-muted2 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-medium text-ink">
                      {hasActiveFilter ? "Không tìm thấy đơn hàng phù hợp bộ lọc" : "Chưa có đơn hàng nào trong hệ thống."}
                    </p>
                  </td>
                </tr>
              )}
              {pagedOrders.map((o) => (
                <tr key={o.id} className="hover:bg-navy-50/50 transition-colors group">
                  <td className="px-5 py-3.5 align-middle">
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-navy-100/90 border border-gray-300 text-amber-400/95 tracking-wide shadow-sm inline-flex items-center gap-1 group-hover:border-amber-500/40"
                    >
                      {o.orderCode}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 align-middle font-medium text-ink">
                    <Link href={`/orders/${o.id}`} className="hover:text-amber-400 transition-colors">
                      {o.customerName}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 align-middle text-xs text-ink2">
                    {employeeDisplayName(o) || <span className="text-muted2">—</span>}
                  </td>
                  <td className="px-5 py-3.5 align-middle text-xs text-ink2 font-mono">
                    {formatDateVN(o.orderDate)}
                  </td>
                  <td className="px-5 py-3.5 align-middle text-xs text-ink2 font-mono">
                    {formatDateVN(o.expectedDeliveryDate)}
                  </td>
                  <td className="px-5 py-3.5 align-middle">
                    <OrderStatusBadge status={o.status} overdue={isOverdue(o)} />
                  </td>
                  <td className="px-5 py-3.5 align-middle text-right font-mono font-bold text-ink">
                    {formatCurrencyVND(o.totalValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phân Trang */}
        {!isLoading && visibleOrders.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200/80 bg-gray-50/80 px-5 py-3 text-xs text-muted-foreground">
            <span>
              Tổng <strong className="font-mono text-ink">{visibleOrders.length}</strong> đơn hàng
              {hasActiveFilter && ` (lọc từ ${data?.orders.length ?? 0} đơn)`} — trang{" "}
              <strong className="font-mono text-ink">{currentPage}</strong>/{totalPages}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-ink2 hover:bg-card hover:text-ink disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Trước
                </button>
                <span className="px-2 font-mono text-ink">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-ink2 hover:bg-card hover:text-ink disabled:opacity-40 transition-colors"
                >
                  Sau <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
