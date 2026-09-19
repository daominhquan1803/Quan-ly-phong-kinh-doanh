"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn, formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { normalizeVN } from "@/lib/text-normalize";
import { EmployeeFilterSelect } from "@/components/shared/EmployeeFilterSelect";
import { FilterInput, SortableTh, toggleSort, type SortState } from "@/components/shared/SortableFilterableTable";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, PackageCheck, TrendingUp, UploadCloud, X, Gauge, Check, RotateCcw } from "lucide-react";

interface OrderRow {
  id: string;
  orderCode: string;
  customerName: string;
  salesEmployeeName: string | null;
  expectedDeliveryDate: string | null;
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
  deliveredValue: number;
  undeliveredValue: number;
}

interface EmployeeMeta {
  id: string;
  name: string;
}

interface DailyDeliveryRow {
  date: string; // "YYYY-MM-DD"
  total: number;
  byEmployee: Record<string, number>;
}

interface ManuallyClosedOrderRow {
  poCode: string;
  customerName: string;
  salesEmployeeName: string;
  manuallyClosedAt: string;
  manuallyClosedByName: string | null;
}

interface SummaryResponse {
  openCount: number;
  overdueCount: number;
  overdueValue: number;
  upcomingCount: number;
  upcomingWindowDays: number;
  onTimeRatePct: number | null;
  rateWindowDays: number;
  totalDeliveredValue: number;
  totalUndeliveredValue: number;
  reportMonthLabel: string;
  dailyWindowDays: number;
  dailyEmployees: EmployeeMeta[];
  dailyDelivery: DailyDeliveryRow[];
  byEmployee: EmployeeRow[];
  manuallyClosedOrders: ManuallyClosedOrderRow[];
  overdueOrders: OrderRow[];
  overdueOrdersTruncated: boolean;
  upcomingOrders: OrderRow[];
  upcomingOrdersTruncated: boolean;
}

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAY_LABELS[date.getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

type SortField = "expectedDeliveryDate" | "daysUntilDeadline" | "remainingValue";

export function ShippingStatusOverview({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<"overdue" | "upcoming">("overdue");
  const [employeeId, setEmployeeId] = useState("");
  const [filterOrderCode, setFilterOrderCode] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterEmployeeName, setFilterEmployeeName] = useState("");
  const [sort, setSort] = useState<SortState<SortField>>({ field: null, dir: "asc" });
  const [pendingCodes, setPendingCodes] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  async function setPoClosed(poCode: string, closed: boolean) {
    if (closed && !window.confirm(`Xác nhận kết thúc đơn ${poCode}? Đơn sẽ được coi là đã hoàn tất, không cần giao thêm và không tính vào giá trị/quá hạn chưa giao nữa. Có thể bấm "Mở lại đơn" sau nếu bấm nhầm.`)) {
      return;
    }
    setPendingCodes((prev) => new Set(prev).add(poCode));
    try {
      const res = await fetch("/api/shipping-status/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poCode, closed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error ?? "Không cập nhật được trạng thái đơn");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["shipping-status-summary"] });
    } finally {
      setPendingCodes((prev) => {
        const next = new Set(prev);
        next.delete(poCode);
        return next;
      });
    }
  }

  async function handleImportFile(file: File) {
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/shipping-status/import", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Nhập file thất bại");
      const batchId = json.batchId as string;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, 2000));
        const statusRes = await fetch(`/api/shipping-status/import/${batchId}`);
        const status = await statusRes.json();
        if (!statusRes.ok) throw new Error(status.error ?? "Không kiểm tra được tiến độ nhập file");
        if (!status.done) {
          setUploadResult(`Đang xử lý... ${status.processedRows} dòng đã ghi`);
          continue;
        }
        setUploadResult(
          `Đọc ${status.totalRows} dòng: tạo mới ${status.createdCount}, cập nhật ${status.updatedCount}` +
            (status.errorCount > 0 ? `, lỗi ${status.errorCount} dòng` : "")
        );
        break;
      }
      queryClient.invalidateQueries({ queryKey: ["shipping-status-summary"] });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setUploading(false);
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
      {/* Top Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl border border-gray-200/80 bg-navy-900/60 p-4 shadow-card backdrop-blur-xl">
        <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_6px_#E0A327]"></span>
          Theo dõi tiến độ từ file Excel PO tracking nhập vào hệ thống
        </p>
        <div className="flex items-center gap-2.5 flex-wrap">
          {isAdmin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportFile(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-xl border border-gray-200/90 bg-navy-50/70 px-4 py-2 text-xs font-medium text-ink hover:border-gray-300 hover:bg-navy-50 disabled:opacity-50 transition-all shadow-sm"
              >
                <UploadCloud className="h-4 w-4 text-info-500" />
                <span>{uploading ? "Đang xử lý..." : "Nhập file PO tracking"}</span>
              </button>
            </>
          )}
          {isAdmin && <EmployeeFilterSelect value={employeeId} onChange={setEmployeeId} />}
        </div>
      </div>

      {uploadResult && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-success-600/30 bg-success-600/10 text-success-600 text-xs px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{uploadResult}</span>
          </div>
          <button onClick={() => setUploadResult(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {uploadError && (
        <div className="flex items-center gap-2 rounded-xl border border-brandRed-600/40 bg-brandRed-50/20 text-alert text-xs px-4 py-3 backdrop-blur-md">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* 4 Thẻ KPI Glassmorphism */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tỷ lệ giao đúng hạn */}
        <div className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-gradient-to-br from-navy-900/90 via-gray-100/70 to-navy-900/90 p-5 shadow-card backdrop-blur-xl transition-all duration-300 hover:border-success-600/40 hover:shadow-[0_8px_30px_rgba(34,179,120,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-ink2 uppercase">
              Tỷ lệ đúng hạn ({data?.rateWindowDays ?? 90} ngày qua)
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-600/10 border border-success-600/20 text-success-600 shadow-[0_0_12px_rgba(34,179,120,0.15)] group-hover:scale-110 transition-transform">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="font-mono text-3xl font-bold tracking-tight text-ink tabular-nums">
              {isLoading ? "—" : data?.onTimeRatePct != null ? `${data.onTimeRatePct}%` : "Chưa có"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Đơn hàng hoàn tất đúng hẹn</p>
          </div>
        </div>

        {/* Đơn hàng đang mở */}
        <div className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-gradient-to-br from-navy-900/90 via-gray-100/70 to-navy-900/90 p-5 shadow-card backdrop-blur-xl transition-all duration-300 hover:border-info-500/40 hover:shadow-[0_8px_30px_rgba(91,141,239,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-ink2 uppercase">
              Đơn hàng đang mở
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-info-500/10 border border-info-500/20 text-info-500 shadow-[0_0_12px_rgba(91,141,239,0.15)] group-hover:scale-110 transition-transform">
              <PackageCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="font-mono text-3xl font-bold tracking-tight text-ink tabular-nums">
              {isLoading ? "—" : data?.openCount ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Đang sản xuất hoặc giao một phần</p>
          </div>
        </div>

        {/* Quá hạn giao */}
        <div
          className={cn(
            "group relative overflow-hidden rounded-2xl border p-5 shadow-card backdrop-blur-xl transition-all duration-300",
            data && data.overdueCount > 0
              ? "border-brandRed-600/40 bg-gradient-to-br from-navy-900/90 via-brandRed-50/10 to-navy-900/90 hover:border-brandRed-600 hover:shadow-[0_8px_30px_rgba(200,16,46,0.2)]"
              : "border-gray-200/80 bg-gradient-to-br from-navy-900/90 via-gray-100/70 to-navy-900/90"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-ink2 uppercase">
              Quá hạn giao ({isLoading ? "—" : data?.overdueCount} đơn)
            </span>
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl border group-hover:scale-110 transition-transform",
                data && data.overdueCount > 0
                  ? "bg-brandRed-50 border-brandRed-600/30 text-alert shadow-[0_0_12px_rgba(200,16,46,0.25)]"
                  : "bg-gray-100 border-gray-200 text-muted2"
              )}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p
              className={cn(
                "font-mono text-2xl font-bold tracking-tight tabular-nums",
                data && data.overdueCount > 0 ? "text-alert" : "text-ink"
              )}
            >
              {isLoading ? "—" : formatCurrencyVND(data?.overdueValue ?? 0)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Giá trị hàng còn tồn đọng quá hạn</p>
          </div>
        </div>

        {/* Sắp đến hạn */}
        <div className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-gradient-to-br from-navy-900/90 via-gray-100/70 to-navy-900/90 p-5 shadow-card backdrop-blur-xl transition-all duration-300 hover:border-amber-500/40 hover:shadow-[0_8px_30px_rgba(224,163,39,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-ink2 uppercase">
              Sắp đến hạn ({data?.upcomingWindowDays ?? 3} ngày tới)
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(224,163,39,0.15)] group-hover:scale-110 transition-transform">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="font-mono text-3xl font-bold tracking-tight text-amber-400 tabular-nums">
              {isLoading ? "—" : data?.upcomingCount ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Cần đốc thúc xưởng hoàn tất</p>
          </div>
        </div>
      </div>

      {/* Bảng Tiến Độ Theo Nhân Viên (Admin) */}
      {isAdmin && data && data.byEmployee.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-navy-900/50 shadow-card backdrop-blur-xl">
          <div className="px-5 py-4 border-b border-gray-200/70 bg-gray-50/50">
            <h3 className="font-semibold text-ink text-sm sm:text-base">
              Tiến độ giao hàng theo từng nhân viên kinh doanh
            </h3>
            <p className="text-xs text-muted2 mt-0.5">So sánh khối lượng đơn mở và hiệu suất giao hàng</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200/80 bg-gray-50/90 text-xs font-semibold uppercase tracking-wider text-ink2/70">
                  <th className="px-5 py-3 text-left">Nhân viên</th>
                  <th className="px-5 py-3 text-right">Đơn đang mở</th>
                  <th className="px-5 py-3 text-right">Quá hạn</th>
                  <th className="px-5 py-3 text-right">Sắp đến hạn</th>
                  <th className="px-5 py-3 text-right">Đã giao (tháng {data.reportMonthLabel})</th>
                  <th className="px-5 py-3 text-right">Chưa giao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40">
                {data.byEmployee.map((e) => (
                  <tr key={e.employeeId} className="hover:bg-navy-50/50 transition-colors">
                    <td className="px-5 py-3 font-semibold text-ink">{e.employeeName}</td>
                    <td className="px-5 py-3 text-right font-mono text-ink">{e.openCount}</td>
                    <td className={cn("px-5 py-3 text-right font-mono", e.overdueCount > 0 ? "text-alert font-bold" : "text-muted2")}>
                      {e.overdueCount}
                    </td>
                    <td className={cn("px-5 py-3 text-right font-mono", e.upcomingCount > 0 ? "text-amber-400 font-bold" : "text-muted2")}>
                      {e.upcomingCount}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-success-600">
                      {formatCurrencyVND(e.deliveredValue)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-alert">
                      {formatCurrencyVND(e.undeliveredValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200/80 bg-gray-50/90 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <td className="px-5 py-3.5 text-ink">Tổng toàn phòng</td>
                  <td className="px-5 py-3.5 text-right font-mono text-ink">{data.openCount}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-alert">{data.overdueCount}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-amber-400">{data.upcomingCount}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-success-600">
                    {formatCurrencyVND(data.totalDeliveredValue)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-alert">
                    {formatCurrencyVND(data.totalUndeliveredValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Bảng Giao Hàng Theo Ngày */}
      {data && data.dailyDelivery.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-navy-900/50 shadow-card backdrop-blur-xl">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-200/70 bg-gray-50/50">
            <CalendarDays className="h-4 w-4 text-amber-400" />
            <h3 className="font-semibold text-ink text-sm sm:text-base">
              Nhật ký giao hàng ({data.dailyWindowDays} ngày gần nhất)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200/80 bg-gray-50/90 text-xs font-semibold uppercase tracking-wider text-ink2/70">
                  <th className="px-5 py-3 text-left">Ngày</th>
                  {data.dailyEmployees.map((e) => (
                    <th key={e.id} className="px-5 py-3 text-right font-medium">
                      {e.name}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-right">Tổng ngày</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40">
                {data.dailyDelivery.map((d) => (
                  <tr key={d.date} className="hover:bg-navy-50/50 transition-colors">
                    <td className="px-5 py-3 font-mono font-medium text-ink">{formatDayLabel(d.date)}</td>
                    {data.dailyEmployees.map((e) => (
                      <td key={e.id} className="px-5 py-3 text-right font-mono text-ink2">
                        {d.byEmployee[e.id] ? formatCurrencyVND(d.byEmployee[e.id]) : <span className="text-muted2/50">—</span>}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-right font-mono font-bold text-success-600">
                      {d.total > 0 ? formatCurrencyVND(d.total) : <span className="text-muted2/50">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200/80 bg-gray-50/90 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <td className="px-5 py-3.5 text-ink">Tổng {data.dailyWindowDays} ngày</td>
                  {data.dailyEmployees.map((e) => (
                    <td key={e.id} className="px-5 py-3.5 text-right font-mono text-ink">
                      {formatCurrencyVND(data.dailyDelivery.reduce((s, d) => s + (d.byEmployee[e.id] ?? 0), 0))}
                    </td>
                  ))}
                  <td className="px-5 py-3.5 text-right font-mono text-success-600">
                    {formatCurrencyVND(data.dailyDelivery.reduce((s, d) => s + d.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tabs Đơn Quá Hạn / Sắp Tới Hạn */}
      <div>
        <div className="flex gap-3 mb-3">
          <button
            onClick={() => setTab("overdue")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
              tab === "overdue"
                ? "bg-gradient-to-r from-brandRed-600 to-brandRed-700 text-white shadow-[0_0_15px_rgba(200,16,46,0.35)]"
                : "bg-navy-900/60 border border-gray-200/80 text-ink2 hover:text-ink hover:bg-navy-50/60"
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Quá hạn giao ({data?.overdueCount ?? 0})</span>
          </button>
          <button
            onClick={() => setTab("upcoming")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
              tab === "upcoming"
                ? "bg-amber-500 text-amber-foreground shadow-[0_0_15px_rgba(224,163,39,0.3)]"
                : "bg-navy-900/60 border border-gray-200/80 text-ink2 hover:text-ink hover:bg-navy-50/60"
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Sắp đến hạn ({data?.upcomingCount ?? 0})</span>
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-navy-900/50 shadow-card backdrop-blur-xl">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50/95 border-b border-gray-200/80 text-xs font-semibold uppercase tracking-wider text-ink2/70">
                <tr>
                  <th className="px-5 py-3 text-left w-36">Mã đơn</th>
                  <th className="px-5 py-3 text-left min-w-[220px]">Khách hàng</th>
                  <th className="px-5 py-3 text-left w-44">NVKD</th>
                  <SortableTh field="expectedDeliveryDate" sort={sort} onSort={handleSort}>
                    Hạn giao
                  </SortableTh>
                  <SortableTh field="daysUntilDeadline" sort={sort} onSort={handleSort} align="right">
                    {tab === "overdue" ? "Quá hạn" : "Còn lại"}
                  </SortableTh>
                  <SortableTh field="remainingValue" sort={sort} onSort={handleSort} align="right">
                    Giá trị còn lại
                  </SortableTh>
                  <th className="px-5 py-3 text-right w-36">Thao tác</th>
                </tr>
                {/* Thanh Lọc Nhanh */}
                <tr className="bg-navy-900/80 border-b border-gray-200/60">
                  <th className="px-5 py-2 font-normal">
                    <FilterInput value={filterOrderCode} onChange={setFilterOrderCode} placeholder="Tìm mã đơn..." />
                  </th>
                  <th className="px-5 py-2 font-normal">
                    <FilterInput value={filterCustomer} onChange={setFilterCustomer} placeholder="Tìm khách hàng..." />
                  </th>
                  <th className="px-5 py-2 font-normal">
                    <FilterInput value={filterEmployeeName} onChange={setFilterEmployeeName} placeholder="Tìm NVKD..." />
                  </th>
                  <th colSpan={4} className="px-5 py-2 text-right">
                    {hasActiveFilter && (
                      <button
                        onClick={clearFilters}
                        className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-medium px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20"
                      >
                        <X className="h-3 w-3" /> Xoá lọc
                      </button>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 text-sm">
                {!isLoading && visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                      {hasActiveFilter
                        ? "Không tìm thấy đơn phù hợp với bộ lọc"
                        : tab === "overdue"
                        ? "Không có đơn hàng nào quá hạn 🎉"
                        : "Không có đơn hàng sắp đến hạn"}
                    </td>
                  </tr>
                )}
                {visibleRows.map((o) => (
                  <tr key={o.id} className="hover:bg-navy-50/50 transition-colors group">
                    <td className="px-5 py-3 align-middle">
                      <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-navy-100/90 border border-gray-300 text-amber-400 tracking-wide shadow-sm inline-block">
                        {o.orderCode}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-middle font-medium text-ink">{o.customerName}</td>
                    <td className="px-5 py-3 align-middle text-xs text-ink2">{o.salesEmployeeName ?? "—"}</td>
                    <td className="px-5 py-3 align-middle text-xs text-ink2 font-mono">
                      {formatDateVN(o.expectedDeliveryDate)}
                    </td>
                    <td
                      className={cn(
                        "px-5 py-3 align-middle text-right font-mono font-bold text-xs",
                        tab === "overdue" ? "text-alert" : "text-amber-400"
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
                    <td className="px-5 py-3 align-middle text-right font-mono font-bold text-ink">
                      {formatCurrencyVND(o.remainingValue)}
                    </td>
                    <td className="px-5 py-3 align-middle text-right">
                      <button
                        onClick={() => setPoClosed(o.orderCode, true)}
                        disabled={pendingCodes.has(o.orderCode)}
                        className="rounded-lg border border-gray-200/90 bg-navy-50/70 px-2.5 py-1 text-xs font-semibold text-ink2 hover:border-brandRed-600 hover:text-alert hover:bg-brandRed-50/10 disabled:opacity-50 transition-all"
                      >
                        {pendingCodes.has(o.orderCode) ? "Đang xử lý..." : "Kết thúc đơn"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Đơn Đã Đóng Thủ Công Gần Đây */}
      {data && data.manuallyClosedOrders.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-navy-900/50 shadow-card backdrop-blur-xl">
          <div className="px-5 py-4 border-b border-gray-200/70 bg-gray-50/50">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <CheckCircle2 className="h-4 w-4 text-success-600" />
              Đơn hàng đã đóng thủ công gần đây
            </div>
            <p className="text-xs text-muted2 mt-0.5">
              Các đơn đã xác nhận kết thúc — không còn tính vào cảnh báo quá hạn.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200/80 bg-gray-50/90 text-xs font-semibold uppercase tracking-wider text-ink2/70">
                  <th className="px-5 py-3 text-left">Mã đơn</th>
                  <th className="px-5 py-3 text-left">Khách hàng</th>
                  <th className="px-5 py-3 text-left">NVKD</th>
                  <th className="px-5 py-3 text-left">Đóng lúc</th>
                  <th className="px-5 py-3 text-left">Người đóng</th>
                  <th className="px-5 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40">
                {data.manuallyClosedOrders.map((o) => (
                  <tr key={o.poCode} className="hover:bg-navy-50/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-amber-400">{o.poCode}</td>
                    <td className="px-5 py-3 font-medium text-ink">{o.customerName}</td>
                    <td className="px-5 py-3 text-xs text-ink2">{o.salesEmployeeName}</td>
                    <td className="px-5 py-3 text-xs text-ink2 font-mono">{formatDateVN(o.manuallyClosedAt)}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{o.manuallyClosedByName ?? "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setPoClosed(o.poCode, false)}
                        disabled={pendingCodes.has(o.poCode)}
                        className="rounded-lg border border-gray-200/90 bg-navy-50/70 px-2.5 py-1 text-xs font-semibold text-ink2 hover:border-amber-500 hover:text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 transition-all"
                      >
                        {pendingCodes.has(o.poCode) ? "Đang xử lý..." : "Mở lại đơn"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
