"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { formatDateVN } from "@/lib/utils";
import { DEBT_REMINDER_MILESTONE_LABEL, DebtReminderMilestone } from "@/lib/debt-reminder";
import { FilterInput, SortableTh, toggleSort, type SortState } from "@/components/shared/SortableFilterableTable";
import { ChevronLeft } from "lucide-react";

interface ReminderLogRow {
  id: string;
  milestone: DebtReminderMilestone;
  occurrence: number;
  displayOccurrence: number | null;
  dueDate: string;
  recipients: string;
  ccRecipients: string | null;
  triggeredBy: string;
  triggeredByName: string | null;
  sentAt: string;
  invoice: {
    customerCode: string;
    customerName: string;
    invoiceNumber: string | null;
    salesEmployee: { name: string } | null;
  };
}

type SortField = "sentAt" | "dueDate";

const sentAtFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

export function DebtReminderHistoryPanel({ isAdmin }: { isAdmin: boolean }) {
  const [milestone, setMilestone] = useState<DebtReminderMilestone | "">("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState<SortField>>({ field: "sentAt", dir: "desc" });

  const { data, isLoading } = useQuery({
    queryKey: ["debt-reminders", milestone, q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (milestone) params.set("milestone", milestone);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/debt/reminders?${params.toString()}`);
      if (!res.ok) throw new Error("Không tải được lịch sử thư nhắc công nợ");
      return (await res.json()) as { logs: ReminderLogRow[] };
    },
  });

  const rows = useMemo(() => {
    const list = [...(data?.logs ?? [])];
    if (!sort.field) return list;
    const dir = sort.dir === "asc" ? 1 : -1;
    const field = sort.field;
    return list.sort((a, b) => (new Date(a[field]).getTime() - new Date(b[field]).getTime()) * dir);
  }, [data, sort]);

  const colCount = isAdmin ? 9 : 8;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/debt"
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-ink hover:bg-white/[0.08] hover:border-white/20 transition-all"
        >
          <ChevronLeft className="h-4 w-4 text-amber-400" />
          Về trang Công nợ
        </Link>
        <select
          value={milestone}
          onChange={(e) => setMilestone(e.target.value as DebtReminderMilestone | "")}
          className="text-xs bg-card text-ink rounded-xl border border-white/10 py-2 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500"
        >
          <option value="">Tất cả mốc</option>
          {Object.entries(DEBT_REMINDER_MILESTONE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="glass-card border border-white/10 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-white/[0.04] text-muted-foreground border-b border-white/5 backdrop-blur-md">
              <tr>
                <SortableTh field="sentAt" sort={sort} onSort={(f) => setSort((prev) => toggleSort(prev, f))}>
                  Thời điểm gửi
                </SortableTh>
                <th className="text-left font-medium px-4 py-3">Khách hàng</th>
                <th className="text-left font-medium px-4 py-3">Số hoá đơn</th>
                <SortableTh field="dueDate" sort={sort} onSort={(f) => setSort((prev) => toggleSort(prev, f))}>
                  Hạn thanh toán
                </SortableTh>
                <th className="text-left font-medium px-4 py-3">Mốc</th>
                <th className="text-left font-medium px-4 py-3">Người nhận</th>
                <th className="text-left font-medium px-4 py-3">CC</th>
                {isAdmin && <th className="text-left font-medium px-4 py-3">NVKD</th>}
                <th className="text-left font-medium px-4 py-3">Nguồn</th>
              </tr>
              <tr className="bg-black/30 border-t border-white/5">
                <th className="px-4 py-2 font-normal" colSpan={2}>
                  <FilterInput value={q} onChange={setQ} placeholder="Tìm khách hàng / số hoá đơn..." />
                </th>
                <th colSpan={colCount - 2} />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-8 text-center text-muted-foreground">
                    Đang tải lịch sử thư nhắc...
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-8 text-center text-muted-foreground">
                    Chưa có thư nhắc nào được gửi.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 font-mono text-muted2 whitespace-nowrap">{sentAtFormatter.format(new Date(r.sentAt))}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">{r.invoice.customerName}</td>
                  <td className="px-4 py-2.5 font-mono text-amber-300/90 font-semibold">{r.invoice.invoiceNumber ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-muted2">{formatDateVN(r.dueDate)}</td>
                  <td
                    className="px-4 py-2.5 text-ink"
                    title={
                      r.milestone === "OVERDUE" && r.displayOccurrence != null && r.displayOccurrence !== r.occurrence
                        ? `Số lần tính theo lịch (ngày quá hạn): lần ${r.occurrence}`
                        : undefined
                    }
                  >
                    {r.milestone === "OVERDUE" ? `Quá hạn (lần ${r.displayOccurrence ?? r.occurrence})` : DEBT_REMINDER_MILESTONE_LABEL[r.milestone] ?? r.milestone}
                  </td>
                  <td className="px-4 py-2.5 text-ink break-all">{r.recipients}</td>
                  <td className="px-4 py-2.5 text-muted2 break-all">{r.ccRecipients ?? "—"}</td>
                  {isAdmin && <td className="px-4 py-2.5 text-ink">{r.invoice.salesEmployee?.name ?? "—"}</td>}
                  <td className="px-4 py-2.5 text-ink">
                    {r.triggeredBy === "CRON" ? "Tự động" : r.triggeredByName ?? "Thủ công"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
