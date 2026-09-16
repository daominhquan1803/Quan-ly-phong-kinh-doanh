"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn, formatCurrencyVND, formatDateVN, toDateInputValueVN } from "@/lib/utils";
import { normalizeVN } from "@/lib/text-normalize";
import { computeDebtStatus, remainingAmount, DEBT_STATUS_LABEL, DebtStatus } from "@/lib/debt-status";
import { DebtStatusBadge } from "./DebtStatusBadge";
import { DebtPaymentsImportWizard } from "./DebtPaymentsImportWizard";
import { EmployeeFilterSelect } from "@/components/shared/EmployeeFilterSelect";
import { FilterInput, SortableTh, toggleSort, type SortState } from "@/components/shared/SortableFilterableTable";
import { UploadCloud, ChevronLeft, ChevronRight, X, CheckCircle2 } from "lucide-react";

interface InvoiceRow {
  id: string;
  customerCode: string;
  customerName: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  originalAmount: string;
  paidAmount: string;
  expectedPaymentDate: string | null;
  lastPaymentDate: string | null;
  salesEmployee: { id: string; name: string } | null;
}
interface SummaryResponse {
  totalOriginal: number;
  totalPaid: number;
  totalDebt: number;
  overdueDebt: number;
  badDebt: number;
  overdueRate: number;
  badDebtRate: number;
  recoveryRate: number;
  perEmployee: { employeeId: string; employeeName: string; totalDebt: number; overdueDebt: number; badDebt: number }[] | null;
  weeklyPlan: { weekIndex: number; start: string; end: string; amount: number }[];
}

type SortField = "dueDate" | "remaining";
const PAGE_SIZE = 10;

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function ImportResultToast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-success-600/10 text-success-600 text-sm px-4 py-2.5">
      <span className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" /> {message}
      </span>
      <button onClick={onClose}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function DebtDashboard({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DebtStatus | "">("");
  const [employeeId, setEmployeeId] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [sort, setSort] = useState<SortState<SortField>>({ field: "dueDate", dir: "asc" });
  const [page, setPage] = useState(1);
  const [showPaymentsWizard, setShowPaymentsWizard] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingBaseline, setUploadingBaseline] = useState(false);
  const [uploadingNewInvoices, setUploadingNewInvoices] = useState(false);
  const baselineInputRef = useRef<HTMLInputElement>(null);
  const newInvoicesInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["debt-invoices", employeeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeId) params.set("employeeId", employeeId);
      const res = await fetch(`/api/debt?${params.toString()}`);
      if (!res.ok) throw new Error("Không tải được danh sách công nợ");
      return res.json() as Promise<{ invoices: InvoiceRow[] }>;
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["debt-summary"],
    queryFn: async () => {
      const res = await fetch("/api/debt/summary");
      if (!res.ok) throw new Error("Không tải được tổng kết công nợ");
      return res.json() as Promise<SummaryResponse>;
    },
  });

  async function handleImport(kind: "baseline" | "new-invoices", file: File) {
    const setUploading = kind === "baseline" ? setUploadingBaseline : setUploadingNewInvoices;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/debt/import/${kind}`, { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import thất bại");
      setToast(
        `${kind === "baseline" ? "Công nợ gốc" : "Hoá đơn mới"}: tạo mới ${json.createdCount}, cập nhật ${json.updatedCount}` +
          (json.errorCount > 0 ? `, lỗi ${json.errorCount} dòng` : "")
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["debt-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["debt-summary"] }),
      ]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setUploading(false);
    }
  }

  async function handleExpectedDateChange(invoiceId: string, value: string) {
    try {
      const res = await fetch(`/api/debt/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedPaymentDate: value || null }),
      });
      if (!res.ok) throw new Error();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["debt-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["debt-summary"] }),
      ]);
    } catch {
      setUploadError("Không lưu được ngày dự kiến thanh toán");
    }
  }

  const rowsWithStatus = useMemo(() => {
    return (data?.invoices ?? []).map((inv) => {
      const original = Number(inv.originalAmount);
      const paid = Number(inv.paidAmount);
      const remaining = remainingAmount(original, paid);
      const debtStatus = computeDebtStatus({ dueDate: inv.dueDate, originalAmount: original, paidAmount: paid });
      return { ...inv, remaining, debtStatus };
    });
  }, [data]);

  const visibleRows = useMemo(() => {
    let list = rowsWithStatus;
    if (status) list = list.filter((r) => r.debtStatus === status);
    if (filterCustomer.trim()) {
      const q = normalizeVN(filterCustomer);
      list = list.filter((r) => normalizeVN(r.customerName).includes(q) || normalizeVN(r.customerCode).includes(q));
    }
    if (sort.field) {
      const dir = sort.dir === "asc" ? 1 : -1;
      const valueOf = (r: (typeof list)[number]): number | null =>
        sort.field === "remaining" ? r.remaining : r.dueDate ? new Date(r.dueDate).getTime() : null;
      list = [...list].sort((a, b) => {
        // Hoá đơn đã thanh toán luôn xuống cuối bảng, không phụ thuộc cột/chiều sắp xếp — để
        // không che mất các hoá đơn còn nợ thật sự cần chú ý (đúng cách xử lý null-date ở
        // OrderTable, áp dụng tương tự cho "đã xong việc").
        if (a.debtStatus === "PAID" && b.debtStatus !== "PAID") return 1;
        if (b.debtStatus === "PAID" && a.debtStatus !== "PAID") return -1;
        const av = valueOf(a);
        const bv = valueOf(b);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      });
    }
    return list;
  }, [rowsWithStatus, status, filterCustomer, sort]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = visibleRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [status, employeeId, filterCustomer, sort]);

  function handleSort(field: SortField) {
    setSort((prev) => toggleSort(prev, field));
  }

  return (
    <div className="space-y-6">
      {toast && <ImportResultToast message={toast} onClose={() => setToast(null)} />}
      {uploadError && <div className="rounded-md bg-brandRed-50 text-brandRed-600 text-sm px-4 py-2.5">{uploadError}</div>}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="kpi-card kpi-card--navy">
            <p className="text-sm text-muted-foreground">Tổng công nợ</p>
            <p className="text-2xl font-bold text-ink mt-1">{formatCurrencyVND(summary.totalDebt)}</p>
          </div>
          <div className="kpi-card kpi-card--red">
            <p className="text-sm text-muted-foreground">Quá hạn</p>
            <p className="text-2xl font-bold text-brandRed-600 mt-1">{formatCurrencyVND(summary.overdueDebt)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{pct(summary.overdueRate)} tổng công nợ</p>
          </div>
          <div className="kpi-card kpi-card--red">
            <p className="text-sm text-muted-foreground">Nợ xấu (quá hạn &gt;180 ngày)</p>
            <p className="text-2xl font-bold text-brandRed-600 mt-1">{formatCurrencyVND(summary.badDebt)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{pct(summary.badDebtRate)} tổng công nợ</p>
          </div>
          <div className="kpi-card kpi-card--navy">
            <p className="text-sm text-muted-foreground">Tỉ lệ thu hồi công nợ</p>
            <p className="text-2xl font-bold text-success-600 mt-1">{pct(summary.recoveryRate)}</p>
          </div>
        </div>
      )}

      {summary && summary.weeklyPlan.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-card p-4">
          <p className="font-medium text-ink text-sm mb-3">Kế hoạch thu hồi công nợ tuần này (theo ngày dự kiến thanh toán NVKD điền)</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {summary.weeklyPlan.map((w) => (
              <div key={w.weekIndex} className="rounded-md bg-gray-50 p-3">
                <p className="text-xs text-muted-foreground">
                  Tuần {w.weekIndex} ({formatDateVN(w.start)}–{formatDateVN(w.end)})
                </p>
                <p className="text-sm font-semibold text-ink mt-1">{formatCurrencyVND(w.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && summary?.perEmployee && summary.perEmployee.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Nhân viên</th>
                <th className="text-right font-medium px-4 py-2.5">Tổng công nợ</th>
                <th className="text-right font-medium px-4 py-2.5">Quá hạn</th>
                <th className="text-right font-medium px-4 py-2.5">Nợ xấu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.perEmployee.map((e) => (
                <tr key={e.employeeId}>
                  <td className="px-4 py-2">{e.employeeName}</td>
                  <td className="px-4 py-2 text-right">{formatCurrencyVND(e.totalDebt)}</td>
                  <td className="px-4 py-2 text-right text-brandRed-600">{formatCurrencyVND(e.overdueDebt)}</td>
                  <td className="px-4 py-2 text-right text-brandRed-600 font-medium">{formatCurrencyVND(e.badDebt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={baselineInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport("baseline", f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => baselineInputRef.current?.click()}
            disabled={uploadingBaseline}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-ink2 hover:bg-gray-50 disabled:opacity-60"
          >
            <UploadCloud className="h-4 w-4" />
            {uploadingBaseline ? "Đang nhập..." : "Nhập công nợ gốc"}
          </button>
          <input
            ref={newInvoicesInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport("new-invoices", f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => newInvoicesInputRef.current?.click()}
            disabled={uploadingNewInvoices}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-ink2 hover:bg-gray-50 disabled:opacity-60"
          >
            <UploadCloud className="h-4 w-4" />
            {uploadingNewInvoices ? "Đang nhập..." : "Nhập hoá đơn mới (cuối tháng)"}
          </button>
          <button
            onClick={() => setShowPaymentsWizard(true)}
            className="flex items-center gap-1.5 rounded-md bg-brandRed-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brandRed-700"
          >
            <UploadCloud className="h-4 w-4" />
            Cập nhật Tiền về
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as DebtStatus | "")}
          className="text-sm bg-card text-ink rounded-md border border-gray-200 py-2 px-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(DEBT_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {isAdmin && <EmployeeFilterSelect value={employeeId} onChange={setEmployeeId} />}
      </div>

      <div className="rounded-lg border border-gray-200 bg-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Khách hàng</th>
              <th className="text-left font-medium px-4 py-2.5">Số hoá đơn</th>
              <th className="text-left font-medium px-4 py-2.5">NVKD</th>
              <SortableTh field="dueDate" sort={sort} onSort={handleSort}>
                Hạn thanh toán
              </SortableTh>
              <SortableTh field="remaining" sort={sort} onSort={handleSort} align="right">
                Còn phải thu
              </SortableTh>
              <th className="text-left font-medium px-4 py-2.5">Trạng thái</th>
              <th className="text-left font-medium px-4 py-2.5">Ngày thanh toán / dự kiến</th>
            </tr>
            <tr className="bg-card border-t border-gray-100">
              <th className="px-4 py-2 font-normal">
                <FilterInput value={filterCustomer} onChange={setFilterCustomer} placeholder="Tìm khách hàng..." />
              </th>
              <th colSpan={6} />
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
            {!isLoading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Không còn công nợ nào khớp bộ lọc.
                </td>
              </tr>
            )}
            {pagedRows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">{r.customerName}</td>
                <td className="px-4 py-2.5">{r.invoiceNumber ?? "—"}</td>
                <td className="px-4 py-2.5">{r.salesEmployee?.name ?? "—"}</td>
                <td className="px-4 py-2.5">{formatDateVN(r.dueDate)}</td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right font-medium",
                    r.debtStatus !== "CURRENT" && r.debtStatus !== "PAID" && "text-brandRed-600"
                  )}
                >
                  {formatCurrencyVND(r.remaining)}
                </td>
                <td className="px-4 py-2.5">
                  <DebtStatusBadge status={r.debtStatus} />
                </td>
                <td className="px-4 py-2.5">
                  {r.debtStatus === "PAID" ? (
                    <span className="text-xs text-success-600">{formatDateVN(r.lastPaymentDate)}</span>
                  ) : (
                    <input
                      type="date"
                      defaultValue={toDateInputValueVN(r.expectedPaymentDate)}
                      onBlur={(e) => handleExpectedDateChange(r.id, e.target.value)}
                      className="input !py-1 !text-xs w-36"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isLoading && visibleRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Tổng {visibleRows.length} hoá đơn — trang {currentPage}/{totalPages}
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

      {showPaymentsWizard && <DebtPaymentsImportWizard onClose={() => setShowPaymentsWizard(false)} />}
    </div>
  );
}
