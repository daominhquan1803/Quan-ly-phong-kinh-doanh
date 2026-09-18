"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { PAYMENT_TERM_TYPE_LABEL, PaymentTermType, describePaymentTerm } from "@/lib/customer-payment-term";

interface CustomerRow {
  id: string;
  customerCode: string;
  customerName: string;
  contactPerson: string | null;
  paymentTermType: PaymentTermType | null;
  paymentTermDays: number | null;
  paymentTermMonthOffset: number | null;
}

interface RowEdit {
  customerName: string;
  contactPerson: string;
  paymentTermType: PaymentTermType | "";
  paymentTermValue: string;
}

function toRowEdit(c: CustomerRow): RowEdit {
  return {
    customerName: c.customerName,
    contactPerson: c.contactPerson ?? "",
    paymentTermType: c.paymentTermType ?? "",
    paymentTermValue: String(c.paymentTermType === "DAYS_FROM_INVOICE" ? c.paymentTermDays ?? "" : c.paymentTermMonthOffset ?? ""),
  };
}

export function CustomersPanel() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customerCode: "",
    customerName: "",
    contactPerson: "",
    paymentTermType: "" as PaymentTermType | "",
    paymentTermValue: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const res = await fetch("/api/customers");
      if (!res.ok) throw new Error("Không tải được danh sách khách hàng");
      return res.json() as Promise<{ customers: CustomerRow[] }>;
    },
  });

  function termPatch(edit: RowEdit) {
    const paymentTermType = edit.paymentTermType || null;
    const numValue = edit.paymentTermValue.trim() === "" ? null : Number(edit.paymentTermValue);
    return {
      paymentTermType,
      paymentTermDays: paymentTermType === "DAYS_FROM_INVOICE" ? numValue : null,
      paymentTermMonthOffset: paymentTermType === "END_OF_MONTH_OFFSET" ? numValue : null,
    };
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
          ...termPatch({ ...form, contactPerson: form.contactPerson }),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Tạo thất bại");
      setForm({ customerCode: "", customerName: "", contactPerson: "", paymentTermType: "", paymentTermValue: "" });
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
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setBusyRow(null);
    }
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-ink">Danh sách khách hàng</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-brandRed-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brandRed-700"
        >
          <Plus className="h-4 w-4" /> Thêm khách hàng
        </button>
      </div>

      {error && <p className="text-sm text-brandRed-600">{error}</p>}
      {recomputeMsg && <p className="text-sm text-success-600">{recomputeMsg}</p>}

      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Mã khách hàng"
              value={form.customerCode}
              onChange={(e) => setForm((f) => ({ ...f, customerCode: e.target.value }))}
              className="input"
            />
            <input
              placeholder="Tên khách hàng"
              value={form.customerName}
              onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
              className="input"
            />
            <input
              placeholder="Người liên hệ"
              value={form.contactPerson}
              onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
              className="input"
            />
            <div className="flex gap-2">
              <select
                value={form.paymentTermType}
                onChange={(e) => setForm((f) => ({ ...f, paymentTermType: e.target.value as PaymentTermType | "" }))}
                className="input flex-1"
              >
                <option value="">— Chưa thiết lập —</option>
                {Object.entries(PAYMENT_TERM_TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {form.paymentTermType && (
                <input
                  type="number"
                  min={0}
                  placeholder={form.paymentTermType === "DAYS_FROM_INVOICE" ? "Số ngày" : "N+"}
                  value={form.paymentTermValue}
                  onChange={(e) => setForm((f) => ({ ...f, paymentTermValue: e.target.value }))}
                  className="input w-24"
                />
              )}
            </div>
          </div>
          <button onClick={handleCreate} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-foreground hover:bg-amber-400">
            Tạo khách hàng
          </button>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Mã khách hàng</th>
              <th className="text-left font-medium px-4 py-2.5">Tên khách hàng</th>
              <th className="text-left font-medium px-4 py-2.5">Người liên hệ</th>
              <th className="text-left font-medium px-4 py-2.5">Thời hạn công nợ</th>
              <th className="text-left font-medium px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.customers.map((c) => {
              const edit = edits[c.id] ?? toRowEdit(c);
              const isEditing = !!edits[c.id];
              function setEdit(patch: Partial<RowEdit>) {
                setEdits((prev) => ({ ...prev, [c.id]: { ...(prev[c.id] ?? toRowEdit(c)), ...patch } }));
              }
              return (
                <tr key={c.id}>
                  <td className="px-4 py-2.5 font-medium text-ink">{c.customerCode}</td>
                  <td className="px-4 py-2.5">
                    <input
                      value={edit.customerName}
                      onChange={(e) => setEdit({ customerName: e.target.value })}
                      className="w-40 text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-2"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      value={edit.contactPerson}
                      onChange={(e) => setEdit({ contactPerson: e.target.value })}
                      className="w-36 text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-2"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={edit.paymentTermType}
                        onChange={(e) => setEdit({ paymentTermType: e.target.value as PaymentTermType | "" })}
                        className="text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-2"
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
                          className="w-16 text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-2"
                        />
                      )}
                    </div>
                    {!isEditing && (
                      <p className="text-xs text-muted-foreground mt-0.5">{describePaymentTerm(c)}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      {isEditing && (
                        <button
                          onClick={() => handleSaveRow(c.id)}
                          disabled={busyRow === c.id}
                          className="text-xs font-medium text-ink hover:underline disabled:opacity-40"
                        >
                          Lưu
                        </button>
                      )}
                      {c.paymentTermType && (
                        <button
                          onClick={() => handleRecompute(c.id)}
                          disabled={busyRow === c.id}
                          title="Tính lại hạn thanh toán cho hoá đơn của khách này chưa có hạn"
                          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-ink disabled:opacity-40"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Tính lại hạn nợ
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={busyRow === c.id}
                        className="text-xs text-brandRed-600 hover:underline disabled:opacity-40"
                      >
                        Xoá
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {data?.customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Chưa có khách hàng nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Thời hạn công nợ dùng để tự động tính &quot;Hạn thanh toán&quot; trên trang Công nợ từ &quot;Ngày chứng
        từ&quot; của hoá đơn — chỉ áp dụng cho hoá đơn CHƯA có hạn thanh toán (không ghi đè hạn admin đã tự sửa).
        Sau khi đổi quy tắc, bấm &quot;Tính lại hạn nợ&quot; để áp dụng cho các hoá đơn cũ còn thiếu hạn của khách này.
      </p>
    </div>
  );
}
