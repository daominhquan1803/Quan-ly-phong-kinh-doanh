"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Search,
  UploadCloud,
  Users,
  UserCheck,
  UserX,
  Clock,
  X,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Save,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Building2,
  Sparkles,
  Filter,
} from "lucide-react";
import { PAYMENT_TERM_TYPE_LABEL, PaymentTermType, describePaymentTerm } from "@/lib/customer-payment-term";
import { normalizeVN } from "@/lib/text-normalize";

interface CustomerRow {
  id: string;
  customerCode: string;
  customerName: string;
  contactPerson: string | null;
  email: string | null;
  manualOverdueReminderBase: number | null;
  salesEmployee: { id: string; name: string } | null;
  paymentTermType: PaymentTermType | null;
  paymentTermDays: number | null;
  paymentTermMonthOffset: number | null;
}

interface EmployeeOption {
  id: string;
  name: string;
  active: boolean;
  amisEmployeeCode: string | null;
}

interface RowEdit {
  customerName: string;
  contactPerson: string;
  email: string;
  manualOverdueReminderBase: string;
  salesEmployeeId: string;
  paymentTermType: PaymentTermType | "";
  paymentTermValue: string;
}

function toRowEdit(c: CustomerRow): RowEdit {
  return {
    customerName: c.customerName,
    contactPerson: c.contactPerson ?? "",
    email: c.email ?? "",
    manualOverdueReminderBase: c.manualOverdueReminderBase == null ? "" : String(c.manualOverdueReminderBase),
    salesEmployeeId: c.salesEmployee?.id ?? "",
    paymentTermType: c.paymentTermType ?? "",
    paymentTermValue: String(
      c.paymentTermType === "DAYS_FROM_INVOICE"
        ? c.paymentTermDays ?? ""
        : c.paymentTermMonthOffset ?? ""
    ),
  };
}

/** isAdmin=false (NVKD): chỉ thấy + sửa khách của mình; không đổi NVKD phụ trách, không nhập Excel hàng loạt. */
export function CustomersPanel({ isAdmin = true }: { isAdmin?: boolean }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customerCode: "",
    customerName: "",
    contactPerson: "",
    email: "",
    salesEmployeeId: "",
    paymentTermType: "" as PaymentTermType | "",
    paymentTermValue: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [nvkdFilter, setNvkdFilter] = useState("");
  const [onlyWithTerms, setOnlyWithTerms] = useState<boolean | null>(null);
  const [onlyMissingEmail, setOnlyMissingEmail] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const res = await fetch("/api/customers");
      if (!res.ok) throw new Error("Không tải được danh sách khách hàng");
      return res.json() as Promise<{ customers: CustomerRow[] }>;
    },
  });

  // Cùng queryKey với DebtDashboard — dùng chung cache react-query cho danh sách nhân viên gán được.
  const { data: usersData } = useQuery({
    queryKey: ["admin-users-filter"],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Không tải được danh sách nhân viên");
      return res.json() as Promise<{ users: EmployeeOption[] }>;
    },
  });
  const assignableEmployees = (usersData?.users ?? []).filter((u) => u.active && u.amisEmployeeCode);

  // Thống kê nhanh KPI
  const stats = useMemo(() => {
    const list = data?.customers ?? [];
    const total = list.length;
    const assigned = list.filter((c) => !!c.salesEmployee?.id).length;
    const unassigned = total - assigned;
    const withTerms = list.filter((c) => !!c.paymentTermType).length;
    return {
      total,
      assigned,
      unassigned,
      withTerms,
      assignedPercent: total > 0 ? Math.round((assigned / total) * 100) : 0,
      withTermsPercent: total > 0 ? Math.round((withTerms / total) * 100) : 0,
    };
  }, [data?.customers]);

  // Số lượng khách hàng theo từng nhân viên kinh doanh
  const employeeCustomerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of data?.customers ?? []) {
      if (c.salesEmployee?.id) {
        counts[c.salesEmployee.id] = (counts[c.salesEmployee.id] ?? 0) + 1;
      }
    }
    return counts;
  }, [data?.customers]);

  // Bộ lọc khách hàng
  const filteredCustomers = useMemo(() => {
    let list = data?.customers ?? [];
    if (nvkdFilter === "UNASSIGNED") {
      list = list.filter((c) => !c.salesEmployee?.id);
    } else if (nvkdFilter) {
      list = list.filter((c) => c.salesEmployee?.id === nvkdFilter);
    }
    if (onlyWithTerms === true) {
      list = list.filter((c) => !!c.paymentTermType);
    } else if (onlyWithTerms === false) {
      list = list.filter((c) => !c.paymentTermType);
    }
    if (onlyMissingEmail) {
      list = list.filter((c) => !c.email);
    }
    if (search.trim()) {
      const q = normalizeVN(search);
      list = list.filter(
        (c) =>
          normalizeVN(c.customerName).includes(q) ||
          normalizeVN(c.customerCode).includes(q) ||
          (c.contactPerson && normalizeVN(c.contactPerson).includes(q))
      );
    }
    return list;
  }, [data, search, nvkdFilter, onlyWithTerms, onlyMissingEmail]);

  // Phân trang
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / (pageSize || 50)));
  const currentPage = Math.min(page, totalPages);
  const paginatedCustomers = useMemo(() => {
    if (pageSize === -1) return filteredCustomers;
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  function termPatch(edit: Pick<RowEdit, "paymentTermType" | "paymentTermValue">) {
    const paymentTermType = edit.paymentTermType || null;
    const numValue = edit.paymentTermValue.trim() === "" ? null : Number(edit.paymentTermValue);
    return {
      paymentTermType,
      paymentTermDays: paymentTermType === "DAYS_FROM_INVOICE" ? numValue : null,
      paymentTermMonthOffset: paymentTermType === "END_OF_MONTH_OFFSET" ? numValue : null,
    };
  }

  async function handleImportFile(file: File) {
    setUploading(true);
    setError(null);
    setImportMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/customers/import", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import thất bại");
      const parts = [
        `Đã xử lý ${json.totalRows} khách hàng (gộp ${json.mergedFromDuplicates} dòng trùng mã)`,
        `tạo mới ${json.createdCount}, cập nhật ${json.updatedCount}`,
      ];
      if (json.skippedNoName > 0)
        parts.push(`bỏ qua ${json.skippedNoName} khách không tìm được tên (${json.noNameSamples.join(", ")})`);
      if (json.unrecognizedTermCount > 0)
        parts.push(
          `${json.unrecognizedTermCount} khách có thời hạn công nợ không nhận diện được (${json.unrecognizedTermSamples.join(", ")})`
        );
      if (json.invalidEmailCount > 0)
        parts.push(`bỏ qua ${json.invalidEmailCount} email sai định dạng (${json.invalidEmails.join(", ")})`);
      setImportMsg(parts.join("; ") + ".");
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setUploading(false);
    }
  }

  async function handleCreate() {
    setError(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerCode: form.customerCode,
          customerName: form.customerName,
          contactPerson: form.contactPerson || null,
          email: form.email || null,
          salesEmployeeId: form.salesEmployeeId || null,
          ...termPatch(form),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Tạo thất bại");
      setForm({
        customerCode: "",
        customerName: "",
        contactPerson: "",
        email: "",
        salesEmployeeId: "",
        paymentTermType: "",
        paymentTermValue: "",
      });
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    }
  }

  async function handleSaveRow(id: string) {
    const edit = edits[id];
    if (!edit) return;
    setBusyRow(id);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: edit.customerName,
          contactPerson: edit.contactPerson || null,
          email: edit.email || null,
          manualOverdueReminderBase: edit.manualOverdueReminderBase.trim() === "" ? null : Number(edit.manualOverdueReminderBase),
          salesEmployeeId: edit.salesEmployeeId || null,
          ...termPatch(edit),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Lưu thất bại");
      setEdits((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (json.recomputedCount > 0) {
        setRecomputeMsg(`Đã cập nhật hạn thanh toán của ${json.recomputedCount} hoá đơn công nợ theo quy tắc mới.`);
        await queryClient.invalidateQueries({ queryKey: ["debt-invoices"] });
        await queryClient.invalidateQueries({ queryKey: ["debt-summary"] });
      }
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setBusyRow(null);
    }
  }

  function handleDiscardRow(id: string) {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleRecompute(id: string) {
    setBusyRow(id);
    setError(null);
    setRecomputeMsg(null);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recomputeDueDates: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Tính lại thất bại");
      setRecomputeMsg(`Đã tính lại hạn thanh toán cho ${json.recomputedCount} hoá đơn.`);
      await queryClient.invalidateQueries({ queryKey: ["debt-invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["debt-summary"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setBusyRow(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Xoá khách hàng này khỏi danh sách?")) return;
    setBusyRow(id);
    try {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Xoá thất bại");
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setBusyRow(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* 4 Thẻ KPI Glassmorphism Đầu Trang (thống kê gán NVKD chỉ có nghĩa với admin) */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${isAdmin ? "" : "hidden"}`}>
        {/* Card 1: Tổng khách hàng */}
        <div
          onClick={() => {
            setNvkdFilter("");
            setOnlyWithTerms(null);
          }}
          className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-gradient-to-br from-navy-900/90 via-gray-100/70 to-navy-900/90 p-5 shadow-card backdrop-blur-xl transition-all duration-300 hover:border-amber-500/40 hover:shadow-[0_8px_30px_rgba(224,163,39,0.12)] cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-ink2 uppercase">
              Tổng khách hàng
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-[0_0_12px_rgba(224,163,39,0.15)] group-hover:scale-110 transition-transform">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold tracking-tight text-ink">
              {stats.total.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">doanh nghiệp</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            Hồ sơ hoạt động trong hệ thống
          </div>
        </div>

        {/* Card 2: Đã gán NVKD */}
        <div
          onClick={() => {
            setNvkdFilter("");
            setOnlyWithTerms(null);
          }}
          className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-gradient-to-br from-navy-900/90 via-gray-100/70 to-navy-900/90 p-5 shadow-card backdrop-blur-xl transition-all duration-300 hover:border-success-600/40 hover:shadow-[0_8px_30px_rgba(34,179,120,0.12)] cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-ink2 uppercase">
              Đã gán NVKD
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-600/10 border border-success-600/20 text-success-600 shadow-[0_0_12px_rgba(34,179,120,0.15)] group-hover:scale-110 transition-transform">
              <UserCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold tracking-tight text-ink">
              {stats.assigned.toLocaleString()}
            </span>
            <span className="inline-flex items-center rounded-full bg-success-600/15 px-2 py-0.5 text-xs font-mono font-medium text-success-600 border border-success-600/20">
              {stats.assignedPercent}%
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success-600"></span>
            Có nhân viên phụ trách trực tiếp
          </div>
        </div>

        {/* Card 3: Chưa gán NVKD */}
        <div
          onClick={() => {
            setNvkdFilter(nvkdFilter === "UNASSIGNED" ? "" : "UNASSIGNED");
            setPage(1);
          }}
          className={`group relative overflow-hidden rounded-2xl border p-5 shadow-card backdrop-blur-xl transition-all duration-300 cursor-pointer ${
            nvkdFilter === "UNASSIGNED"
              ? "border-brandRed-600 bg-brandRed-50/20 shadow-[0_0_24px_rgba(200,16,46,0.25)]"
              : stats.unassigned > 0
              ? "border-brandRed-600/40 bg-gradient-to-br from-navy-900/90 via-brandRed-50/10 to-navy-900/90 hover:border-brandRed-600 hover:shadow-[0_8px_30px_rgba(200,16,46,0.15)]"
              : "border-gray-200/80 bg-gradient-to-br from-navy-900/90 via-gray-100/70 to-navy-900/90"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-ink2 uppercase">
              Chưa gán NVKD
            </span>
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl border group-hover:scale-110 transition-transform ${
                stats.unassigned > 0
                  ? "bg-brandRed-50 border-brandRed-600/30 text-alert shadow-[0_0_12px_rgba(200,16,46,0.2)]"
                  : "bg-gray-100 border-gray-200 text-muted2"
              }`}
            >
              <UserX className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`font-mono text-3xl font-bold tracking-tight ${
                stats.unassigned > 0 ? "text-alert" : "text-ink"
              }`}
            >
              {stats.unassigned}
            </span>
            {stats.unassigned > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brandRed-50 px-2 py-0.5 text-xs font-semibold text-alert border border-brandRed-600/20 animate-pulse">
                Cần gán
              </span>
            ) : (
              <span className="text-xs text-success-600 font-medium">100% đã gán</span>
            )}
          </div>
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                stats.unassigned > 0 ? "bg-brandRed-600" : "bg-gray-400"
              }`}
            ></span>
            {nvkdFilter === "UNASSIGNED" ? "Đang lọc danh sách này (Click để huỷ)" : "Nhấp để lọc danh sách chưa gán"}
          </div>
        </div>

        {/* Card 4: Đã cấu hình hạn nợ */}
        <div
          onClick={() => {
            setOnlyWithTerms(onlyWithTerms === true ? null : true);
            setPage(1);
          }}
          className={`group relative overflow-hidden rounded-2xl border p-5 shadow-card backdrop-blur-xl transition-all duration-300 cursor-pointer ${
            onlyWithTerms === true
              ? "border-info-500 bg-info-500/10 shadow-[0_0_24px_rgba(91,141,239,0.2)]"
              : "border-gray-200/80 bg-gradient-to-br from-navy-900/90 via-gray-100/70 to-navy-900/90 hover:border-info-500/40 hover:shadow-[0_8px_30px_rgba(91,141,239,0.12)]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-ink2 uppercase">
              Hạn nợ tự động
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info-500/10 border border-info-500/20 text-info-500 shadow-[0_0_12px_rgba(91,141,239,0.15)] group-hover:scale-110 transition-transform">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold tracking-tight text-ink">
              {stats.withTerms.toLocaleString()}
            </span>
            <span className="inline-flex items-center rounded-full bg-info-500/15 px-2 py-0.5 text-xs font-mono font-medium text-info-500 border border-info-500/20">
              {stats.withTermsPercent}%
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-info-500"></span>
            Tự động tính hạn thanh toán hoá đơn
          </div>
        </div>
      </div>

      {/* Thông báo thông tin / lỗi */}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-brandRed-600/40 bg-brandRed-50/20 p-4 text-sm text-alert backdrop-blur-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-alert" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-alert hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {importMsg && (
        <div className="flex items-center justify-between rounded-xl border border-success-600/30 bg-success-600/10 p-4 text-sm text-success-600 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success-600" />
            <span>{importMsg}</span>
          </div>
          <button onClick={() => setImportMsg(null)} className="text-success-600 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {recomputeMsg && (
        <div className="flex items-center justify-between rounded-xl border border-info-500/30 bg-info-500/10 p-4 text-sm text-info-500 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-info-500" />
            <span>{recomputeMsg}</span>
          </div>
          <button onClick={() => setRecomputeMsg(null)} className="text-info-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Form Thêm Mới Khách Hàng (Floating Glass Card) */}
      {showForm && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-b from-navy-900/95 via-gray-100/90 to-navy-900/95 p-6 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-all">
          <div className="flex items-center justify-between pb-4 border-b border-gray-200/60">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-500">
                <Plus className="h-4 w-4" />
              </div>
              <h3 className="text-base font-semibold text-ink">Thêm hồ sơ khách hàng mới</h3>
            </div>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-gray-200 hover:text-ink transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink2">
                Mã khách hàng <span className="text-alert">*</span>
              </label>
              <input
                placeholder="VD: KH-00951"
                value={form.customerCode}
                onChange={(e) => setForm((f) => ({ ...f, customerCode: e.target.value }))}
                className="w-full rounded-xl border border-gray-200/80 bg-navy-50/70 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted2/60 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink2">
                Tên khách hàng / Công ty <span className="text-alert">*</span>
              </label>
              <input
                placeholder="VD: CÔNG TY TNHH ABC..."
                value={form.customerName}
                onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                className="w-full rounded-xl border border-gray-200/80 bg-navy-50/70 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted2/60 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink2">
                Người liên hệ
              </label>
              <input
                placeholder="Họ tên người phụ trách mua hàng"
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                className="w-full rounded-xl border border-gray-200/80 bg-navy-50/70 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted2/60 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink2">
                Email nhận thư nhắc công nợ
              </label>
              {/* type="text", KHÔNG type="email": trình duyệt chặn chuỗi nhiều địa chỉ. */}
              <input
                type="text"
                placeholder="Email nhận thư nhắc công nợ (nhiều email cách nhau dấu phẩy)"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-xl border border-gray-200/80 bg-navy-50/70 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted2/60 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className={isAdmin ? "" : "hidden"}>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink2">
                NVKD phụ trách
              </label>
              <select
                value={form.salesEmployeeId}
                onChange={(e) => setForm((f) => ({ ...f, salesEmployeeId: e.target.value }))}
                className="w-full rounded-xl border border-gray-200/80 bg-navy-50/70 px-3 py-2.5 text-sm text-ink focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="">— Chưa gán nhân viên kinh doanh —</option>
                {assignableEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink2">
                Quy tắc tính hạn công nợ
              </label>
              <div className="flex gap-2">
                <select
                  value={form.paymentTermType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      paymentTermType: e.target.value as PaymentTermType | "",
                    }))
                  }
                  className="flex-1 rounded-xl border border-gray-200/80 bg-navy-50/70 px-3 py-2.5 text-sm text-ink focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">— Chưa thiết lập quy tắc —</option>
                  {Object.entries(PAYMENT_TERM_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                {form.paymentTermType && (
                  <div className="relative w-36">
                    <input
                      type="number"
                      min={0}
                      placeholder={form.paymentTermType === "DAYS_FROM_INVOICE" ? "Số ngày" : "Tháng N+"}
                      value={form.paymentTermValue}
                      onChange={(e) => setForm((f) => ({ ...f, paymentTermValue: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200/80 bg-navy-50/70 px-3 py-2.5 text-sm text-ink focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-gray-200/60">
            <button
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-ink2 hover:bg-gray-50 transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-amber-foreground shadow-[0_0_20px_rgba(224,163,39,0.3)] hover:bg-amber-400 transition-all"
            >
              <Plus className="h-4 w-4" /> Tạo hồ sơ khách hàng
            </button>
          </div>
        </div>
      )}

      {/* Thanh Điều Khiển Toolbar Glassmorphism */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200/80 bg-navy-900/60 p-4 shadow-card backdrop-blur-xl">
        {/* Bộ lọc bên trái */}
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Ô tìm kiếm */}
          <div className="relative min-w-[260px] sm:w-80">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm mã KH, tên công ty, người liên hệ..."
              className="w-full rounded-xl border border-gray-200/80 bg-navy-50/80 pl-9 pr-8 py-2 text-sm text-ink placeholder:text-muted2/60 transition-all focus:border-amber-500 focus:bg-navy-50 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Bộ lọc NVKD */}
          <div className={`relative ${isAdmin ? "" : "hidden"}`}>
            <select
              value={nvkdFilter}
              onChange={(e) => {
                setNvkdFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-gray-200/80 bg-navy-50/80 px-3 py-2 text-sm text-ink transition-all focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">Tất cả NVKD ({stats.total})</option>
              <option value="UNASSIGNED" className="text-alert font-medium">
                ⚠️ Chưa gán NVKD ({stats.unassigned})
              </option>
              {assignableEmployees.map((emp) => {
                const count = employeeCustomerCounts[emp.id] ?? 0;
                return (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Lọc khách còn thiếu email nhận thư nhắc công nợ */}
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200/80 bg-navy-50/80 px-3 py-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={onlyMissingEmail}
              onChange={(e) => {
                setOnlyMissingEmail(e.target.checked);
                setPage(1);
              }}
              className="accent-amber-500"
            />
            Chưa có email
          </label>

          {/* Reset Filters badge nếu đang lọc */}
          {(nvkdFilter || search || onlyWithTerms !== null || onlyMissingEmail) && (
            <button
              onClick={() => {
                setSearch("");
                setNvkdFilter("");
                setOnlyWithTerms(null);
                setOnlyMissingEmail(false);
                setPage(1);
              }}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 px-2 py-1 rounded-lg border border-amber-500/20 bg-amber-500/10 transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Đặt lại lọc
            </button>
          )}
        </div>

        {/* Các nút hành động bên phải */}
        <div className="flex items-center gap-2.5">
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
            className={`${isAdmin ? "flex" : "hidden"} items-center gap-2 rounded-xl border border-gray-200/90 bg-navy-50/70 px-4 py-2 text-sm font-medium text-ink transition-all hover:border-gray-300 hover:bg-navy-50 disabled:opacity-50 shadow-sm`}
          >
            <UploadCloud className="h-4 w-4 text-info-500" />
            <span>{uploading ? "Đang nhập Excel..." : "Nhập file Excel"}</span>
          </button>

          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brandRed-600 to-brandRed-700 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_20px_rgba(200,16,46,0.35)] hover:from-brandRed-700 hover:to-brandRed-800 hover:shadow-[0_0_25px_rgba(200,16,46,0.5)] transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Thêm khách hàng</span>
          </button>
        </div>
      </div>

      {/* Bảng Dữ Liệu Khách Hàng Glassmorphism */}
      <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-navy-900/50 shadow-card backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200/80 bg-gray-50/90 text-xs font-semibold uppercase tracking-wider text-ink2/70">
                <th className="px-5 py-3.5 text-left w-36">Mã khách hàng</th>
                <th className="px-5 py-3.5 text-left min-w-[280px]">Tên khách hàng & Người liên hệ</th>
                <th className="px-5 py-3.5 text-left min-w-[240px]">Email nhận thư nhắc</th>
                <th className="px-5 py-3.5 text-left w-32">Đã nhắc tay</th>
                <th className="px-5 py-3.5 text-left w-64">NVKD phụ trách</th>
                <th className="px-5 py-3.5 text-left min-w-[240px]">Thời hạn công nợ</th>
                <th className="px-5 py-3.5 text-right w-44">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/40">
              {paginatedCustomers.map((c) => {
                const edit = edits[c.id] ?? toRowEdit(c);
                const isEditing = !!edits[c.id];

                function setEdit(patch: Partial<RowEdit>) {
                  setEdits((prev) => ({
                    ...prev,
                    [c.id]: { ...(prev[c.id] ?? toRowEdit(c)), ...patch },
                  }));
                }

                return (
                  <tr
                    key={c.id}
                    className={`group transition-all duration-150 ${
                      isEditing
                        ? "bg-amber-500/[0.04] border-l-2 border-l-amber-500"
                        : "hover:bg-navy-50/50"
                    }`}
                  >
                    {/* Cột Mã khách hàng */}
                    <td className="px-5 py-3.5 align-middle">
                      <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-navy-100/90 border border-gray-300 text-amber-400/95 tracking-wide shadow-sm inline-flex items-center gap-1">
                        {c.customerCode}
                      </span>
                    </td>

                    {/* Cột Tên khách hàng & Người liên hệ */}
                    <td className="px-5 py-3.5 align-middle">
                      <div className="space-y-1">
                        <input
                          value={edit.customerName}
                          onChange={(e) => setEdit({ customerName: e.target.value })}
                          placeholder="Nhập tên công ty / khách hàng"
                          className="w-full text-sm font-medium text-ink bg-transparent hover:bg-gray-50/80 focus:bg-gray-50 border border-transparent hover:border-gray-200/80 focus:border-amber-500 rounded-lg px-2.5 py-1 transition-all focus:outline-none"
                        />
                        <div className="flex items-center gap-1.5 pl-2">
                          <span className="text-[11px] text-muted-foreground">LH:</span>
                          <input
                            value={edit.contactPerson}
                            onChange={(e) => setEdit({ contactPerson: e.target.value })}
                            placeholder="Chưa có người liên hệ"
                            className="w-full text-xs text-ink2/90 bg-transparent hover:bg-gray-50/80 focus:bg-gray-50 border border-transparent hover:border-gray-200/80 focus:border-amber-500 rounded-md px-1.5 py-0.5 transition-all focus:outline-none placeholder:text-muted2/50"
                          />
                        </div>
                      </div>
                    </td>

                    {/* Cột Email nhận thư nhắc công nợ (nhiều email cách nhau dấu phẩy) */}
                    <td className="px-5 py-3.5 align-middle">
                      <input
                        type="text"
                        value={edit.email}
                        onChange={(e) => setEdit({ email: e.target.value })}
                        placeholder="—"
                        title="Email nhận thư nhắc công nợ (nhiều email cách nhau dấu phẩy)"
                        className="w-full text-xs text-ink2/90 bg-transparent hover:bg-gray-50/80 focus:bg-gray-50 border border-transparent hover:border-gray-200/80 focus:border-amber-500 rounded-md px-1.5 py-0.5 transition-all focus:outline-none placeholder:text-muted2/50"
                      />
                    </td>

                    {/* Cột "Đã nhắc tay" — số lần NVKD đã tự nhắc nợ quá hạn thủ công TRƯỚC khi dùng hệ
                        thống (chỉ ảnh hưởng số "lần thứ N" in trong thư quá hạn, không đổi lịch gửi). */}
                    <td className="px-5 py-3.5 align-middle">
                      <input
                        type="number"
                        min={0}
                        value={edit.manualOverdueReminderBase}
                        onChange={(e) => setEdit({ manualOverdueReminderBase: e.target.value })}
                        placeholder="—"
                        title="Số lần đã nhắc nợ quá hạn thủ công trước khi dùng hệ thống — CHỈ áp cho nợ cũ. Để trống = hệ thống tự tính theo số ngày quá hạn (xoá về trống thì các hoá đơn nợ cũ in lại số theo lịch). Điền 0 = chỉ đếm thư hệ thống gửi."
                        className="w-20 text-xs text-ink2/90 bg-transparent hover:bg-gray-50/80 focus:bg-gray-50 border border-transparent hover:border-gray-200/80 focus:border-amber-500 rounded-md px-1.5 py-0.5 transition-all focus:outline-none placeholder:text-muted2/50"
                      />
                    </td>

                    {/* Cột NVKD phụ trách */}
                    <td className="px-5 py-3.5 align-middle">
                      {!isAdmin ? (
                        <span className="text-sm text-ink">{c.salesEmployee?.name ?? "—"}</span>
                      ) : (
                      <div className="relative">
                        <select
                          value={edit.salesEmployeeId}
                          onChange={(e) => setEdit({ salesEmployeeId: e.target.value })}
                          className={`w-full text-xs font-medium rounded-xl border px-3 py-2 transition-all focus:outline-none ${
                            edit.salesEmployeeId
                              ? "bg-navy-50/80 border-gray-200/90 text-ink focus:border-amber-500"
                              : "bg-brandRed-50/90 border-brandRed-600/40 text-alert font-semibold focus:border-brandRed-600 shadow-[0_0_10px_rgba(200,16,46,0.1)]"
                          }`}
                        >
                          <option value="" className="text-alert font-semibold">
                            ⚠️ Chưa gán NVKD
                          </option>
                          {assignableEmployees.map((emp) => (
                            <option key={emp.id} value={emp.id} className="text-ink">
                              {emp.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      )}
                    </td>

                    {/* Cột Thời hạn công nợ */}
                    <td className="px-5 py-3.5 align-middle">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={edit.paymentTermType}
                            onChange={(e) =>
                              setEdit({ paymentTermType: e.target.value as PaymentTermType | "" })
                            }
                            className="text-xs bg-navy-50/80 text-ink rounded-lg border border-gray-200/90 py-1.5 px-2.5 focus:border-amber-500 focus:outline-none"
                          >
                            <option value="">— Chưa thiết lập —</option>
                            {Object.entries(PAYMENT_TERM_TYPE_LABEL).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                          {edit.paymentTermType && (
                            <input
                              type="number"
                              min={0}
                              placeholder={edit.paymentTermType === "DAYS_FROM_INVOICE" ? "ngày" : "N+"}
                              value={edit.paymentTermValue}
                              onChange={(e) => setEdit({ paymentTermValue: e.target.value })}
                              className="w-16 text-xs bg-navy-50/80 text-ink rounded-lg border border-gray-200/90 py-1.5 px-2 text-center font-mono focus:border-amber-500 focus:outline-none"
                            />
                          )}
                        </div>

                        {!isEditing && (
                          <div>
                            {c.paymentTermType ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-success-600/10 border border-success-600/20 px-2 py-0.5 text-[11px] font-medium text-success-600">
                                <Clock className="h-3 w-3" />
                                {describePaymentTerm(c)}
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground italic">
                                Chưa có quy tắc hạn nợ
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Cột Thao tác */}
                    <td className="px-5 py-3.5 align-middle text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isEditing && (
                          <>
                            <button
                              onClick={() => handleSaveRow(c.id)}
                              disabled={busyRow === c.id}
                              title="Lưu thay đổi"
                              className="flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-amber-foreground px-2.5 py-1.5 text-xs font-bold shadow-[0_0_12px_rgba(224,163,39,0.3)] transition-all disabled:opacity-40 animate-pulse"
                            >
                              <Save className="h-3.5 w-3.5" />
                              <span>Lưu</span>
                            </button>
                            <button
                              onClick={() => handleDiscardRow(c.id)}
                              disabled={busyRow === c.id}
                              title="Hủy thay đổi"
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-gray-100 hover:text-ink transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}

                        {c.paymentTermType && (
                          <button
                            onClick={() => handleRecompute(c.id)}
                            disabled={busyRow === c.id}
                            title="Tính lại hạn thanh toán cho các hoá đơn chưa có hạn của khách này"
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-navy-50 hover:text-amber-400 transition-colors disabled:opacity-40"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(c.id)}
                          disabled={busyRow === c.id}
                          title="Xoá khách hàng"
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-brandRed-50 hover:text-alert transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2 text-muted-foreground">
                      <Building2 className="h-10 w-10 text-muted2 opacity-50" />
                      <p className="text-sm font-medium text-ink">Không tìm thấy khách hàng nào</p>
                      <p className="text-xs text-muted-foreground">
                        {search.trim() || nvkdFilter
                          ? "Thử thay đổi từ khoá tìm kiếm hoặc đặt lại bộ lọc"
                          : "Hệ thống chưa có dữ liệu khách hàng"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Thanh Phân Trang & Đếm Kết Quả */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200/80 bg-gray-50/80 px-5 py-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              Hiển thị{" "}
              <strong className="font-mono text-ink">
                {filteredCustomers.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} -{" "}
                {Math.min(currentPage * pageSize, filteredCustomers.length)}
              </strong>{" "}
              trên <strong className="font-mono text-ink">{filteredCustomers.length}</strong> khách hàng
              {filteredCustomers.length !== stats.total && (
                <span className="text-muted2"> (tổng {stats.total})</span>
              )}
            </span>

            <div className="flex items-center gap-1.5">
              <span>Mỗi trang:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-card py-1 px-2 text-xs text-ink focus:border-amber-500 focus:outline-none"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={-1}>Tất cả</option>
              </select>
            </div>
          </div>

          {pageSize !== -1 && totalPages > 1 && (
            <div className="flex items-center gap-2">
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
      </div>

      {/* Ghi chú chân trang */}
      <div className="rounded-xl border border-gray-200/60 bg-navy-900/30 p-4 text-xs text-muted-foreground backdrop-blur-md">
        <div className="flex items-start gap-2.5">
          <Clock className="h-4 w-4 shrink-0 text-amber-500/80 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-ink">Quy tắc thời hạn công nợ:</strong> Dùng để tự động xác định{" "}
            <span className="text-amber-400 font-medium">&quot;Hạn thanh toán&quot;</span> trên trang Công nợ từ{" "}
            <span className="text-ink font-medium">&quot;Ngày chứng từ&quot;</span> của hoá đơn. Chỉ áp dụng cho
            hoá đơn <strong className="text-ink">chưa có hạn thanh toán</strong> (không ghi đè hạn đã nhập thủ
            công). Sau khi sửa quy tắc, hãy bấm biểu tượng{" "}
            <RefreshCw className="inline-block h-3 w-3 text-amber-400" /> ở cột thao tác để áp dụng cho các hoá
            đơn cũ còn thiếu hạn của khách đó.
          </p>
        </div>
      </div>
    </div>
  );
}
