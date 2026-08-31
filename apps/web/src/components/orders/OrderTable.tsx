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
import { Upload, RefreshCw, CheckCircle2, XCircle, X, FilePlus2, ChevronLeft, ChevronRight } from "lucide-react";

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
  // Mặc định xếp đơn MỚI NHẤT lên đầu. Cố tình sắp ở client thay vì để nguyên thứ tự server trả
  // về: PostgreSQL khi ORDER BY orderDate DESC sẽ đưa đơn KHÔNG có ngày đặt lên trước tiên
  // (NULLS FIRST là mặc định của Postgres cho DESC), khiến dòng đầu bảng là đơn thiếu ngày chứ
  // không phải đơn gần nhất — xem cách xử lý null trong hàm sắp xếp bên dưới.
  const [sort, setSort] = useState<SortState<SortField>>({ field: "orderDate", dir: "desc" });
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const PAGE_SIZE = 10;

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
        // Đơn thiếu ngày LUÔN xuống cuối, không phụ thuộc chiều sắp xếp — nếu để chúng tham gia
        // so sánh như giá trị nhỏ nhất thì khi sắp giảm dần chúng nhảy lên đầu bảng, che mất đơn
        // mới nhất (đúng lỗi PostgreSQL cũng mắc: ORDER BY ... DESC mặc định cho NULL lên trước).
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      });
    }
    return list;
  }, [data, filterOrderCode, filterCustomer, filterEmployeeName, sort]);

  // Số trang tính lại theo danh sách ĐÃ lọc/sắp xếp. currentPage được kẹp lại thay vì lưu thẳng
  // vào state, để khi lọc làm danh sách ngắn đi thì không bị đứng ở 1 trang trống.
  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedOrders = visibleOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Mọi thao tác đổi tập dữ liệu (lọc, sắp xếp, đổi nhân viên/trạng thái) đều đưa về trang 1 —
  // giữ nguyên trang cũ dễ khiến người dùng tưởng "không có kết quả" khi đang ở trang cuối.
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
    <div className="space-y-4">
      {/* Cảnh báo khách có nguy cơ mất — đặt trên cùng vì đây là việc cần hành động, khác với
          bảng đơn hàng bên dưới chỉ để tra cứu. Tự ẩn khi không có cảnh báo nào. */}
      <CustomerRiskPanel employeeId={isAdmin ? employeeId : ""} />

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
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <>
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
            </>
          )}
          {/* Thêm đơn thủ công (upload 1 file "Đơn đặt hàng") — cả NVKD lẫn Quản trị viên đều
              dùng được, khác với 2 nút trên (chỉ Quản trị viên, dùng cho nhập/đồng bộ hàng loạt). */}
          <Link
            href="/orders/manual"
            className="flex items-center gap-1.5 rounded-md border border-brandRed-600 px-3 py-2 text-sm font-semibold text-brandRed-600 hover:bg-brandRed-50"
          >
            <FilePlus2 className="h-4 w-4" />
            Thêm đơn thủ công
          </Link>
        </div>
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
            {pagedOrders.map((o) => (
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
      {!isLoading && visibleOrders.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Tổng {visibleOrders.length} đơn
            {hasActiveFilter && ` (lọc từ ${data?.orders.length ?? 0} đơn)`} — trang {currentPage}/{totalPages}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Trước
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:opacity-40"
              >
                Sau <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
