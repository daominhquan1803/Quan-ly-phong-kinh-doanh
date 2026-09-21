"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { cn, formatCurrencyVND, formatDateVN, toDateInputValueVN } from "@/lib/utils";

export interface AssignablePayment {
  id: string;
  paymentDate: string | null;
  customerCode: string | null;
  customerName: string | null;
  rawDescription: string | null;
  unallocatedAmount: number;
}

interface Candidate {
  id: string;
  customerCode: string;
  customerName: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  remaining: number;
  sameCustomer: boolean;
}

/** Gắn 1 khoản Tiền về chưa khớp vào hoá đơn công nợ đang có (quản trị viên chọn hoá đơn, có thể sửa
 * ngày tiền về nếu file ghi sai năm). Portal ra body vì .glass-card có backdrop-blur. */
export function AssignPaymentModal({ payment, onClose }: { payment: AssignablePayment; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(toDateInputValueVN(payment.paymentDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["debt-assign-candidates", payment.id, debouncedQ],
    queryFn: async () => {
      const res = await fetch(`/api/debt/unmatched-payments/${payment.id}/candidates?q=${encodeURIComponent(debouncedQ)}`);
      if (!res.ok) throw new Error("Không tải được danh sách hoá đơn");
      return (await res.json()) as { invoices: Candidate[] };
    },
  });
  const candidates = data?.invoices ?? [];

  function pick(c: Candidate) {
    setSelected(c);
    setAmount(String(Math.round(Math.min(payment.unallocatedAmount, c.remaining))));
    setError(null);
  }

  async function handleSave() {
    if (!selected) return;
    setError(null);
    const value = Number(amount.replace(/[^\d.]/g, ""));
    if (!value || value <= 0) {
      setError("Nhập số tiền gắn lớn hơn 0");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/debt/unmatched-payments/${payment.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: selected.id, amount: value, ...(paymentDate ? { paymentDate } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không gắn được");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["debt-unmatched-payments"] }),
        queryClient.invalidateQueries({ queryKey: ["debt-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["debt-summary"] }),
      ]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  const suspiciousDate = paymentDate && Number(paymentDate.slice(0, 4)) > new Date().getFullYear();

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-white/10 bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Gắn tiền về vào khoản công nợ</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {payment.customerName ?? payment.customerCode ?? "—"} · {formatDateVN(payment.paymentDate)} ·{" "}
              <span className="font-mono text-alert">{formatCurrencyVND(payment.unallocatedAmount)}</span> chưa khớp
            </p>
            {payment.rawDescription && <p className="mt-1 text-[11px] text-muted2">{payment.rawDescription}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-ink" aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm hoá đơn theo tên khách, mã khách, số hoá đơn..."
            className="input pl-9"
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10">
          {isLoading ? (
            <p className="p-3 text-xs text-muted-foreground">Đang tải...</p>
          ) : candidates.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              {debouncedQ ? "Không có hoá đơn còn phải thu nào khớp từ khoá." : "Chưa có hoá đơn cùng khách — gõ tên khách hoặc số hoá đơn để tìm."}
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition-colors hover:bg-white/[0.05]",
                      selected?.id === c.id && "bg-amber-500/10"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">
                        {c.customerName}
                        {c.sameCustomer && <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">cùng khách</span>}
                      </span>
                      <span className="block text-muted-foreground">
                        HĐ {c.invoiceNumber ?? "—"} · chứng từ {formatDateVN(c.invoiceDate)} · hạn {formatDateVN(c.dueDate)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right font-mono text-alert">{formatCurrencyVND(c.remaining)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div className="mt-3 space-y-2.5 rounded-xl border border-white/10 p-3.5">
            <p className="text-xs text-ink">
              Gắn vào HĐ <span className="font-mono font-semibold">{selected.invoiceNumber ?? "—"}</span> — {selected.customerName} (còn{" "}
              {formatCurrencyVND(selected.remaining)})
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Số tiền gắn (đ)
                <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Ngày tiền về
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="input" />
              </label>
            </div>
            {suspiciousDate && <p className="text-[11px] text-amber-400">Ngày này ở tương lai — file Tiền về có thể ghi sai năm, kiểm tra lại.</p>}
            {error && <p className="text-xs text-alert">{error}</p>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-amber-foreground hover:bg-amber-400 disabled:opacity-50"
            >
              {saving ? "Đang gắn..." : "Gắn vào hoá đơn"}
            </button>
          </div>
        )}
        {!selected && error && <p className="mt-2 text-xs text-alert">{error}</p>}
      </div>
    </div>,
    document.body
  );
}
