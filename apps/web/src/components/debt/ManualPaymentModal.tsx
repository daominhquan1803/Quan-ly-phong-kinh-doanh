"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, X } from "lucide-react";
import { formatCurrencyVND, formatDateVN } from "@/lib/utils";

export interface ManualPaymentInvoice {
  id: string;
  customerName: string;
  invoiceNumber: string | null;
}

interface PaymentRow {
  allocationId: string;
  amount: number;
  paymentDate: string | null;
  isManual: boolean;
  note: string | null;
  description: string | null;
}
interface PaymentsResponse {
  originalAmount: number;
  paidAmount: number;
  remaining: number;
  payments: PaymentRow[];
}

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Quản trị viên nhập tay tiền về + ngày về cho 1 hoá đơn (khoản đã thanh toán thật nhưng dữ liệu gốc
 * chưa cập nhật), kèm lịch sử tiền về và xoá được khoản nhập tay nếu nhập nhầm. Portal ra body vì
 * .glass-card có backdrop-blur (khung chứa của phần tử position:fixed). */
export function ManualPaymentModal({ invoice, onClose }: { invoice: ManualPaymentInvoice; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayInput());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["debt-payments", invoice.id],
    queryFn: async () => {
      const res = await fetch(`/api/debt/${invoice.id}/payments`);
      if (!res.ok) throw new Error("Không tải được lịch sử tiền về");
      return (await res.json()) as PaymentsResponse;
    },
  });

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["debt-payments", invoice.id] }),
      queryClient.invalidateQueries({ queryKey: ["debt-invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["debt-summary"] }),
    ]);
  }

  async function handleSave() {
    setError(null);
    const value = Number(amount.replace(/[^\d.]/g, ""));
    if (!value || value <= 0) {
      setError("Nhập số tiền về lớn hơn 0");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/debt/${invoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, paymentDate, note: note || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không ghi nhận được");
      setAmount("");
      setNote("");
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(allocationId: string) {
    if (!window.confirm("Xoá khoản tiền về nhập tay này?")) return;
    setError(null);
    const res = await fetch(`/api/debt/${invoice.id}/payments/${allocationId}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Không xoá được");
      return;
    }
    await refreshAll();
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0f172a] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Ghi nhận tiền về</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {invoice.customerName} · HĐ {invoice.invoiceNumber ?? "—"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-ink" aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>

        {data && (
          <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-white/[0.04] p-2.5">
              <p className="text-muted2">Số tiền HĐ</p>
              <p className="font-mono font-semibold text-ink">{formatCurrencyVND(data.originalAmount)}</p>
            </div>
            <div className="rounded-lg bg-white/[0.04] p-2.5">
              <p className="text-muted2">Đã thu</p>
              <p className="font-mono font-semibold text-emerald-400">{formatCurrencyVND(data.paidAmount)}</p>
            </div>
            <div className="rounded-lg bg-white/[0.04] p-2.5">
              <p className="text-muted2">Còn phải thu</p>
              <p className="font-mono font-semibold text-brandRed-600">{formatCurrencyVND(data.remaining)}</p>
            </div>
          </div>
        )}

        <div className="space-y-2.5 rounded-xl border border-white/10 p-3.5">
          <p className="text-xs font-semibold text-ink">Nhập tay khoản tiền về</p>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Số tiền về (đ)
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={data ? String(Math.round(data.remaining)) : ""}
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Ngày tiền về
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="input" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Ghi chú (không bắt buộc)
            <input value={note} onChange={(e) => setNote(e.target.value)} className="input" />
          </label>
          {data && data.remaining > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(Math.round(data.remaining)))}
              className="text-xs text-amber-400 hover:underline"
            >
              Điền đủ số còn phải thu ({formatCurrencyVND(data.remaining)})
            </button>
          )}
          {error && <p className="text-xs text-brandRed-600">{error}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Ghi nhận tiền về"}
          </button>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-ink">Lịch sử tiền về</p>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Đang tải...</p>
          ) : !data || data.payments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa có khoản tiền về nào.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {data.payments.map((p) => (
                <li key={p.allocationId} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-emerald-400">{formatCurrencyVND(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.paymentDate ? formatDateVN(p.paymentDate) : "Chưa rõ ngày"} · {p.isManual ? "Nhập tay" : "Từ file Tiền về"}
                    </p>
                    {p.note && <p className="text-[11px] text-muted2">{p.note}</p>}
                  </div>
                  {p.isManual && (
                    <button onClick={() => handleDelete(p.allocationId)} className="text-muted2 hover:text-brandRed-600" title="Xoá khoản nhập tay">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
