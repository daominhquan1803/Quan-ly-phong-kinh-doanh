"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { AlertTriangle, Link2, Trash2 } from "lucide-react";
import { AssignPaymentModal } from "./AssignPaymentModal";

interface UnmatchedPayment {
  id: string;
  paymentDate: string | null;
  customerCode: string | null;
  customerName: string | null;
  rawDescription: string | null;
  amount: string;
  matchStatus: "UNMATCHED" | "PARTIAL";
  unallocatedAmount: number;
}

/**
 * Tiền về THẬT đã vào tài khoản nhưng KHÔNG khớp được (hết) vào công nợ — nằm ngoài kế hoạch/công
 * nợ đang theo dõi, admin cần xem lại và xử lý tay (đặt cọc, khách mới chưa có hoá đơn trong hệ
 * thống, ghi nhầm mã khách hàng...). Chỉ ADMIN xem được (DebtPayment không gắn được với 1 nhân
 * viên kinh doanh cụ thể nào).
 */
export function DebtUnmatchedPaymentsPanel() {
  const queryClient = useQueryClient();
  const [assigning, setAssigning] = useState<UnmatchedPayment | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleIgnore(p: UnmatchedPayment) {
    const label = `${p.customerName ?? p.customerCode ?? "khoản này"} — ${formatCurrencyVND(p.unallocatedAmount)}`;
    if (
      !window.confirm(
        `Xoá khoản tiền về chưa khớp: ${label}?\n\nKhoản này sẽ không còn hiện ở đây và không được tính vào công nợ. Upload lại file Tiền về cũng không làm nó hiện lại.`
      )
    ) {
      return;
    }
    setError(null);
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/debt/unmatched-payments/${p.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không xoá được");
      await queryClient.invalidateQueries({ queryKey: ["debt-unmatched-payments"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setBusyId(null);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["debt-unmatched-payments"],
    queryFn: async () => {
      const res = await fetch("/api/debt/unmatched-payments");
      if (!res.ok) throw new Error("Không tải được danh sách Tiền về chưa khớp");
      return res.json() as Promise<{ payments: UnmatchedPayment[] }>;
    },
  });

  const payments = data?.payments ?? [];
  if (!isLoading && payments.length === 0) return null;
  const total = payments.reduce((s, p) => s + p.unallocatedAmount, 0);

  return (
    <div className="glass-card border border-amber-500/30 bg-amber-500/[0.03] p-4 space-y-3 relative overflow-hidden shadow-[0_0_20px_rgba(224,163,39,0.06)]">
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-[0_0_10px_rgba(224,163,39,0.25)]">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div>
          <p className="font-semibold text-ink text-sm flex items-center gap-2">
            Tiền về ngoài kế hoạch / chưa khớp công nợ
            {!isLoading && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono">
                {payments.length} giao dịch · {formatCurrencyVND(total)}
              </span>
            )}
          </p>
          <p className="text-xs text-muted2 mt-0.5">Tiền đã về tài khoản nhưng chưa khớp hết vào các hoá đơn cụ thể</p>
        </div>
      </div>
      {error && <p className="text-xs text-alert">{error}</p>}
      {assigning && <AssignPaymentModal payment={assigning} onClose={() => setAssigning(null)} />}
      {!isLoading && (
        <div className="rounded-xl border border-white/5 bg-black/30 overflow-x-auto max-h-72">
          <table className="min-w-full text-xs">
            <thead className="bg-white/[0.04] text-muted-foreground sticky top-0 backdrop-blur-md border-b border-white/5">
              <tr>
                <th className="text-left font-medium px-3.5 py-2.5">Ngày</th>
                <th className="text-left font-medium px-3.5 py-2.5">Khách hàng</th>
                <th className="text-left font-medium px-3.5 py-2.5">Mô tả</th>
                <th className="text-right font-medium px-3.5 py-2.5">Chưa khớp</th>
                <th className="text-right font-medium px-3.5 py-2.5">Xử lý</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-3.5 py-2 text-muted2 font-mono">{formatDateVN(p.paymentDate)}</td>
                  <td className="px-3.5 py-2 font-medium text-ink">{p.customerName ?? p.customerCode ?? "—"}</td>
                  <td className="px-3.5 py-2 text-muted-foreground max-w-xs truncate" title={p.rawDescription ?? ""}>
                    {p.rawDescription ?? "—"}
                  </td>
                  <td className="px-3.5 py-2 text-right text-alert font-mono font-semibold">
                    {formatCurrencyVND(p.unallocatedAmount)}
                  </td>
                  <td className="px-3.5 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => setAssigning(p)}
                      disabled={busyId === p.id}
                      title="Gắn vào khoản công nợ đang có"
                      className="mr-1.5 inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                    >
                      <Link2 className="h-3 w-3" /> Gắn vào công nợ
                    </button>
                    <button
                      onClick={() => handleIgnore(p)}
                      disabled={busyId === p.id}
                      title="Xoá khoản chưa khớp này"
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-muted-foreground hover:border-brandRed-600/40 hover:text-alert disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" /> Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
