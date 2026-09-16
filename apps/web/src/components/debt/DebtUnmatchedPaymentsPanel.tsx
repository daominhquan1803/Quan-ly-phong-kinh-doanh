"use client";

import { useQuery } from "@tanstack/react-query";
import { formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

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
    <div className="rounded-lg border border-warning-500/40 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning-500" />
        <p className="font-medium text-ink text-sm">
          Tiền về ngoài kế hoạch / chưa khớp công nợ{!isLoading && ` — ${payments.length} giao dịch, ${formatCurrencyVND(total)}`}
        </p>
      </div>
      {!isLoading && (
        <div className="rounded-lg border border-gray-200 overflow-x-auto max-h-72">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left font-medium px-3 py-2">Ngày</th>
                <th className="text-left font-medium px-3 py-2">Khách hàng</th>
                <th className="text-left font-medium px-3 py-2">Mô tả</th>
                <th className="text-right font-medium px-3 py-2">Chưa khớp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-1.5">{formatDateVN(p.paymentDate)}</td>
                  <td className="px-3 py-1.5">{p.customerName ?? p.customerCode ?? "—"}</td>
                  <td className="px-3 py-1.5 text-ink2 max-w-xs truncate" title={p.rawDescription ?? ""}>
                    {p.rawDescription ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right text-brandRed-600 font-medium">
                    {formatCurrencyVND(p.unallocatedAmount)}
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
