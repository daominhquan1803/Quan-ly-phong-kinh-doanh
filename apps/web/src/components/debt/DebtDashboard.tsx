"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn, formatCurrencyVND, formatDateVN, toDateInputValueVN } from "@/lib/utils";
import { normalizeVN } from "@/lib/text-normalize";
import { computeDebtStatus, remainingAmount, overdueDays, DEBT_STATUS_LABEL, DebtStatus } from "@/lib/debt-status";
import { DebtStatusBadge } from "./DebtStatusBadge";
import { DebtPaymentsImportWizard } from "./DebtPaymentsImportWizard";
import { DebtUnmatchedPaymentsPanel } from "./DebtUnmatchedPaymentsPanel";
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
interface EmployeeOption {
  id: string;
  name: string;
  role: "ADMIN" | "SALES";
  active: boolean;
  amisEmployeeCode: string | null;
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
  weeklyPlan: { weekIndex: number; start: string; end: string; planned: number; collected: number; rate: number | null }[];
  monthlyPlan: { planned: number; collected: number; rate: number | null };
}

type SortField = "dueDate" | "remaining";
const PAGE_SIZE = 10;

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function ImportResultToast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-sm px-4 py-3 shadow-[0_0_15px_rgba(16,185,129,0.15)] backdrop-blur-sm">
      <span className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> {message}
      </span>
      <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-ink">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function DebtDashboard({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DebtStatus | "">("");
  const [employeeId, setEmployeeId] = useState("");
  const [nvkdFilter, setNvkdFilter] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [sort, setSort] = useState<SortState<SortField>>({ field: "dueDate", dir: "asc" });
  const [page, setPage] = useState(1);
  const [showPaymentsWizard, setShowPaymentsWizard] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
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
    queryKey: ["debt-summary", employeeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeId) params.set("employeeId", employeeId);
      const res = await fetch(`/api/debt/summary?${params.toString()}`);
      if (!res.ok) throw new Error("Không tải được tổng kết công nợ");
      return res.json() as Promise<SummaryResponse>;
    },
  });

  // Cùng queryKey với EmployeeFilterSelect (dùng chung cache react-query) — cần danh sách nhân
  // viên đầy đủ ở đây để dựng dropdown "gán lại NVKD" cho từng dòng hoá đơn.
  const { data: usersData } = useQuery({
    queryKey: ["admin-users-filter"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Không tải được danh sách nhân viên");
      return res.json() as Promise<{ users: EmployeeOption[] }>;
    },
    enabled: isAdmin,
  });
  const assignableEmployees = (usersData?.users ?? []).filter((u) => u.active && u.amisEmployeeCode);

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

  // expectedPaymentDate luôn phải gửi kèm (schema PATCH bắt buộc) — giữ nguyên giá trị hiện tại
  // của hoá đơn khi admin chỉ đang sửa hạn thanh toán hoặc gán lại NVKD, tránh vô tình xoá mất.
  async function handleAdminInvoiceEdit(row: InvoiceRow, patch: { dueDate?: string | null; salesEmployeeId?: string | null }) {
    try {
      const res = await fetch(`/api/debt/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedPaymentDate: toDateInputValueVN(row.expectedPaymentDate) || null, ...patch }),
      });
      if (!res.ok) throw new Error();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["debt-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["debt-summary"] }),
      ]);
    } catch {
      setUploadError("Không lưu được thay đổi hoá đơn");
    }
  }

  const rowsWithStatus = useMemo(() => {
    return (data?.invoices ?? []).map((inv) => {
      const original = Number(inv.originalAmount);
      const paid = Number(inv.paidAmount);
      const remaining = remainingAmount(original, paid);
      const debtStatus = computeDebtStatus({ dueDate: inv.dueDate, originalAmount: original, paidAmount: paid });
      const daysOverdue = debtStatus === "PAID" ? null : overdueDays(inv.dueDate);
      return { ...inv, remaining, debtStatus, daysOverdue };
    });
  }, [data]);

  const visibleRows = useMemo(() => {
    let list = rowsWithStatus;
    if (status) list = list.filter((r) => r.debtStatus === status);
    if (nvkdFilter) list = list.filter((r) => r.salesEmployee?.id === nvkdFilter);
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
  }, [rowsWithStatus, status, nvkdFilter, filterCustomer, sort]);

  const nvkdOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rowsWithStatus) {
      if (r.salesEmployee) map.set(r.salesEmployee.id, r.salesEmployee.name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "vi"));
  }, [rowsWithStatus]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = visibleRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [status, nvkdFilter, employeeId, filterCustomer, sort]);

  const expandedWeekInvoices = useMemo(() => {
    if (expandedWeek === null || !summary) return [];
    const week = summary.weeklyPlan.find((w) => w.weekIndex === expandedWeek);
    if (!week) return [];
    const start = new Date(week.start).getTime();
    const end = new Date(week.end).getTime();
    return rowsWithStatus
      .filter((r) => {
        if (!r.expectedPaymentDate) return false;
        const t = new Date(r.expectedPaymentDate).getTime();
        return t >= start && t <= end;
      })
      .sort((a, b) => (a.debtStatus === "PAID" ? 1 : 0) - (b.debtStatus === "PAID" ? 1 : 0));
  }, [expandedWeek, summary, rowsWithStatus]);

  function handleSort(field: SortField) {
    setSort((prev) => toggleSort(prev, field));
  }

  return (
    <div className="space-y-6">
      {toast && <ImportResultToast message={toast} onClose={() => setToast(null)} />}
      {uploadError && (
        <div className="rounded-xl border border-brandRed-500/30 bg-brandRed-500/10 text-brandRed-400 text-sm px-4 py-3 flex items-center justify-between shadow-[0_0_15px_rgba(200,16,46,0.15)]">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="p-1 hover:bg-white/10 rounded-lg">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isAdmin && (
        <div className="flex items-center gap-2.5">
          <span className="text-xs uppercase tracking-wider text-muted2 font-medium">Xem theo nhân viên:</span>
          <EmployeeFilterSelect value={employeeId} onChange={setEmployeeId} />
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="glass-card border border-white/10 p-4 relative overflow-hidden group hover:border-amber-500/30 transition-all">
            <p className="text-xs font-medium text-muted2 tracking-wider uppercase">Tổng công nợ</p>
            <p className="text-2xl font-bold font-mono text-ink mt-2">{formatCurrencyVND(summary.totalDebt)}</p>
            <div className="h-0.5 w-12 bg-white/20 mt-3 group-hover:w-full group-hover:bg-amber-400/50 transition-all duration-300" />
          </div>

          <div className="glass-card border border-brandRed-500/30 bg-brandRed-500/[0.04] p-4 relative overflow-hidden group hover:shadow-[0_0_20px_rgba(200,16,46,0.15)] transition-all">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-brandRed-400 tracking-wider uppercase">Quá hạn</p>
              <span className="h-2 w-2 rounded-full bg-brandRed-500 shadow-[0_0_6px_#C8102E]" />
            </div>
            <p className="text-2xl font-bold font-mono text-brandRed-400 mt-2">{formatCurrencyVND(summary.overdueDebt)}</p>
            <p className="text-xs text-muted2 mt-1">{pct(summary.overdueRate)} tổng công nợ</p>
            <div className="h-0.5 w-12 bg-brandRed-500/40 mt-3 group-hover:w-full group-hover:bg-brandRed-500 transition-all duration-300" />
          </div>

          <div className="glass-card border border-brandRed-500/25 bg-brandRed-500/[0.02] p-4 relative overflow-hidden group hover:shadow-[0_0_20px_rgba(200,16,46,0.15)] transition-all">
            <p className="text-xs font-medium text-brandRed-400/80 tracking-wider uppercase">Tỉ lệ nợ quá hạn</p>
            <p className="text-2xl font-bold font-mono text-brandRed-400 mt-2">{pct(summary.overdueRate)}</p>
            <div className="h-0.5 w-12 bg-brandRed-500/30 mt-3 group-hover:w-full transition-all duration-300" />
          </div>

          <div className="glass-card border border-brandRed-500/40 bg-brandRed-500/[0.06] p-4 relative overflow-hidden group hover:shadow-[0_0_25px_rgba(200,16,46,0.2)] transition-all">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-brandRed-400 tracking-wider uppercase">Nợ xấu (&gt;180 ngày)</p>
              <span className="h-2 w-2 rounded-full bg-brandRed-500 animate-ping" />
            </div>
            <p className="text-2xl font-bold font-mono text-brandRed-400 mt-2">{formatCurrencyVND(summary.badDebt)}</p>
            <p className="text-xs text-muted2 mt-1">{pct(summary.badDebtRate)} tổng công nợ</p>
            <div className="h-0.5 w-12 bg-brandRed-500/50 mt-3 group-hover:w-full group-hover:bg-brandRed-500 transition-all duration-300" />
          </div>

          <div className="glass-card border border-emerald-500/30 bg-emerald-500/[0.04] p-4 relative overflow-hidden group hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] transition-all">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-emerald-400 tracking-wider uppercase">Tỉ lệ thu hồi</p>
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            </div>
            <p className="text-2xl font-bold font-mono text-emerald-400 mt-2">{pct(summary.recoveryRate)}</p>
            <div className="h-0.5 w-12 bg-emerald-500/40 mt-3 group-hover:w-full group-hover:bg-emerald-500 transition-all duration-300" />
          </div>
        </div>
      )}

      {summary && summary.weeklyPlan.length > 0 && (
        <div className="glass-card border border-white/10 p-5 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 pb-3">
            <div>
              <p className="font-semibold text-ink text-sm">
                Kế hoạch thu hồi công nợ tháng này
              </p>
              <p className="text-xs text-muted2 mt-0.5">Dựa trên ngày dự kiến thanh toán nhân viên kinh doanh cập nhật</p>
            </div>
            <div className="text-xs font-mono text-muted2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
              Cả tháng: <span className="text-emerald-400 font-semibold">{formatCurrencyVND(summary.monthlyPlan.collected)}</span> /{" "}
              <span className="text-ink">{formatCurrencyVND(summary.monthlyPlan.planned)}</span>
              {summary.monthlyPlan.rate !== null && (
                <span className="ml-2 font-semibold text-amber-400">({pct(summary.monthlyPlan.rate)} đạt)</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {summary.weeklyPlan.map((w) => (
              <button
                key={w.weekIndex}
                type="button"
                onClick={() => setExpandedWeek((cur) => (cur === w.weekIndex ? null : w.weekIndex))}
                className={cn(
                  "rounded-xl p-3.5 text-left border transition-all relative overflow-hidden",
                  expandedWeek === w.weekIndex
                    ? "bg-amber-500/15 border-amber-500/50 shadow-[0_0_15px_rgba(224,163,39,0.2)] ring-1 ring-amber-500/30"
                    : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/15"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted2">
                    Tuần {w.weekIndex}
                  </p>
                  <span className="text-[10px] text-muted2 font-mono">{formatDateVN(w.start).slice(0, 5)}–{formatDateVN(w.end).slice(0, 5)}</span>
                </div>
                <p className="text-sm font-bold font-mono text-ink mt-2">
                  <span className="text-emerald-400">{formatCurrencyVND(w.collected)}</span>
                  <span className="text-muted2 text-xs font-normal"> / {formatCurrencyVND(w.planned)}</span>
                </p>
                {w.rate !== null && (
                  <p className={cn("text-xs mt-1.5 font-medium font-mono", w.rate >= 1 ? "text-emerald-400" : "text-amber-400")}>
                    {pct(w.rate)} đạt chỉ tiêu
                  </p>
                )}
              </button>
            ))}
          </div>

          {expandedWeek !== null && (
            <div className="mt-4 rounded-xl border border-white/5 bg-black/40 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-white/[0.04] text-muted-foreground border-b border-white/5">
                  <tr>
                    <th className="text-left font-medium px-3.5 py-2.5">Khách hàng</th>
                    <th className="text-left font-medium px-3.5 py-2.5">Số hoá đơn</th>
                    <th className="text-right font-medium px-3.5 py-2.5">Số tiền</th>
                    <th className="text-left font-medium px-3.5 py-2.5">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {expandedWeekInvoices.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3.5 py-4 text-center text-muted-foreground">
                        Không có khoản nào dự kiến thu tuần này.
                      </td>
                    </tr>
                  )}
                  {expandedWeekInvoices.map((r) => (
                    <tr key={r.id} className="hover:bg-white/[0.02]">
                      <td className="px-3.5 py-2 text-ink font-medium">{r.customerName}</td>
                      <td className="px-3.5 py-2 font-mono text-amber-300/90">{r.invoiceNumber ?? "—"}</td>
                      <td className="px-3.5 py-2 text-right font-mono font-semibold text-ink">{formatCurrencyVND(Number(r.originalAmount))}</td>
                      <td className="px-3.5 py-2">
                        {r.debtStatus === "PAID" ? (
                          <span className="text-emerald-400 font-medium inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Đã về{r.lastPaymentDate ? ` ngày ${formatDateVN(r.lastPaymentDate)}` : ""}
                          </span>
                        ) : Number(r.paidAmount) > 0 ? (
                          <span className="text-emerald-400 font-medium whitespace-pre-wrap font-mono">
                            Đã về {formatCurrencyVND(Number(r.paidAmount))}
                            {r.lastPaymentDate ? ` ngày ${formatDateVN(r.lastPaymentDate)}` : ""}
                          </span>
                        ) : (
                          <span className="text-brandRed-400 font-medium">Chưa về</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {isAdmin && <DebtUnmatchedPaymentsPanel />}

      {isAdmin && summary?.perEmployee && summary.perEmployee.length > 0 && (
        <div className="glass-card border border-white/10 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-ink text-sm">Công nợ theo từng Nhân viên kinh doanh</h3>
            <span className="text-xs text-muted2 font-mono">{summary.perEmployee.length} nhân viên</span>
          </div>
          <div className="rounded-xl border border-white/5 bg-black/40 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-white/[0.04] text-muted-foreground border-b border-white/5">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Nhân viên</th>
                  <th className="text-right font-medium px-4 py-2.5">Tổng công nợ</th>
                  <th className="text-right font-medium px-4 py-2.5">Quá hạn</th>
                  <th className="text-right font-medium px-4 py-2.5">Nợ xấu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {summary.perEmployee.map((e) => (
                  <tr key={e.employeeId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2 text-ink font-medium">{e.employeeName}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink font-medium">{formatCurrencyVND(e.totalDebt)}</td>
                    <td className="px-4 py-2 text-right font-mono text-brandRed-400 font-medium">{formatCurrencyVND(e.overdueDebt)}</td>
                    <td className="px-4 py-2 text-right font-mono text-brandRed-400 font-bold">{formatCurrencyVND(e.badDebt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2.5">
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
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-ink hover:bg-white/[0.08] hover:border-white/20 disabled:opacity-60 transition-all"
            >
              <UploadCloud className="h-4 w-4 text-amber-400" />
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
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-ink hover:bg-white/[0.08] hover:border-white/20 disabled:opacity-60 transition-all"
            >
              <UploadCloud className="h-4 w-4 text-amber-400" />
              {uploadingNewInvoices ? "Đang nhập..." : "Nhập HĐ mới"}
            </button>
            <button
              onClick={() => setShowPaymentsWizard(true)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brandRed-600 to-brandRed-700 hover:from-brandRed-500 hover:to-brandRed-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(200,16,46,0.3)] transition-all"
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
            className="text-xs bg-card text-ink rounded-xl border border-white/10 py-2 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(DEBT_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {isAdmin && nvkdOptions.length > 0 && (
            <select
              value={nvkdFilter}
              onChange={(e) => setNvkdFilter(e.target.value)}
              className="text-xs bg-card text-ink rounded-xl border border-white/10 py-2 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">Tất cả NVKD</option>
              {nvkdOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="glass-card border border-white/10 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-white/[0.04] text-muted-foreground border-b border-white/5 backdrop-blur-md">
              <tr>
                <th className="text-left font-medium px-4 py-3">Khách hàng</th>
                <th className="text-left font-medium px-4 py-3">Số hoá đơn</th>
                <th className="text-left font-medium px-4 py-3">Ngày chứng từ</th>
                <th className="text-left font-medium px-4 py-3">NVKD</th>
                <SortableTh field="dueDate" sort={sort} onSort={handleSort}>
                  Hạn thanh toán
                </SortableTh>
                <th className="text-right font-medium px-4 py-3">Số ngày quá hạn</th>
                <th className="text-right font-medium px-4 py-3">Số tiền HĐ</th>
                <SortableTh field="remaining" sort={sort} onSort={handleSort} align="right">
                  Còn phải thu
                </SortableTh>
                <th className="text-left font-medium px-4 py-3">Trạng thái</th>
                <th className="text-left font-medium px-4 py-3">Ngày thanh toán / dự kiến</th>
              </tr>
              <tr className="bg-black/30 border-t border-white/5">
                <th className="px-4 py-2 font-normal">
                  <FilterInput value={filterCustomer} onChange={setFilterCustomer} placeholder="Tìm khách hàng..." />
                </th>
                <th colSpan={9} />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    <div className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                      Đang tải danh sách công nợ...
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    Không còn công nợ nào khớp bộ lọc.
                  </td>
                </tr>
              )}
              {pagedRows.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 font-medium text-ink">{r.customerName}</td>
                  <td className="px-4 py-2.5 font-mono text-amber-300/90 font-semibold">{r.invoiceNumber ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-muted2">{formatDateVN(r.invoiceDate)}</td>
                  <td className="px-4 py-2.5">
                    {isAdmin ? (
                      <select
                        value={r.salesEmployee?.id ?? ""}
                        onChange={(e) => handleAdminInvoiceEdit(r, { salesEmployeeId: e.target.value || null })}
                        className="input !py-1 !text-xs !bg-black/40 !border-white/10 w-32 rounded-lg"
                      >
                        <option value="">— Chưa gán —</option>
                        {assignableEmployees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      r.salesEmployee?.name ?? "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono">
                    {isAdmin ? (
                      <input
                        type="date"
                        defaultValue={toDateInputValueVN(r.dueDate)}
                        onBlur={(e) => handleAdminInvoiceEdit(r, { dueDate: e.target.value || null })}
                        className="input !py-1 !text-xs !bg-black/40 !border-white/10 w-36 rounded-lg font-mono"
                      />
                    ) : (
                      formatDateVN(r.dueDate)
                    )}
                  </td>
                  <td className={cn("px-4 py-2.5 text-right font-mono", r.daysOverdue !== null && r.daysOverdue > 0 ? "text-brandRed-400 font-bold" : "text-muted2")}>
                    {r.daysOverdue === null ? "—" : r.daysOverdue}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink">{formatCurrencyVND(Number(r.originalAmount))}</td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-mono font-bold",
                      r.debtStatus !== "CURRENT" && r.debtStatus !== "PAID" ? "text-brandRed-400" : "text-emerald-400"
                    )}
                  >
                    {formatCurrencyVND(r.remaining)}
                  </td>
                  <td className="px-4 py-2.5">
                    <DebtStatusBadge status={r.debtStatus} />
                  </td>
                  <td className="px-4 py-2.5">
                    {r.debtStatus === "PAID" ? (
                      <span className="text-xs font-mono text-emerald-400 font-medium">{formatDateVN(r.lastPaymentDate)}</span>
                    ) : (
                      <input
                        type="date"
                        defaultValue={toDateInputValueVN(r.expectedPaymentDate)}
                        onBlur={(e) => handleExpectedDateChange(r.id, e.target.value)}
                        className="input !py-1 !text-xs !bg-black/40 !border-white/10 w-36 rounded-lg font-mono"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!isLoading && visibleRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted2">
          <span>
            Tổng <strong className="text-ink font-mono">{visibleRows.length}</strong> hoá đơn — trang {currentPage}/{totalPages}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Trước
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
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
