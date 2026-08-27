"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, FileText } from "lucide-react";
import { formatDateVN } from "@/lib/utils";

interface SlipRow {
  id: string;
  slipNumber: string;
  slipDate: string;
  customerName: string;
  salesEmployeeNameSnapshot: string | null;
  createdAt: string;
  _count: { items: number };
}

export function PickingSlipList() {
  const { data, isLoading } = useQuery({
    queryKey: ["picking-slips"],
    queryFn: async () => {
      const res = await fetch("/api/picking-slips");
      if (!res.ok) throw new Error("Không tải được danh sách");
      return res.json() as Promise<{ slips: SlipRow[] }>;
    },
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-medium text-ink">Phiếu đã tạo</h2>
        <Link
          href="/picking-slips/new"
          className="flex items-center gap-1.5 rounded-md bg-brandRed-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brandRed-700"
        >
          <Plus className="h-4 w-4" /> Tạo phiếu mới
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="font-medium px-3 py-2">Số phiếu</th>
              <th className="font-medium px-3 py-2">Ngày lập</th>
              <th className="font-medium px-3 py-2">Khách hàng</th>
              <th className="font-medium px-3 py-2">Phụ trách</th>
              <th className="font-medium px-3 py-2 text-center">Số dòng hàng</th>
              <th className="font-medium px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Đang tải...
                </td>
              </tr>
            )}
            {!isLoading && (data?.slips.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Chưa có phiếu soạn hàng nào — bấm &quot;Tạo phiếu mới&quot; để bắt đầu.
                </td>
              </tr>
            )}
            {data?.slips.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 font-mono text-ink">{s.slipNumber}</td>
                <td className="px-3 py-2 text-ink2">{formatDateVN(s.slipDate)}</td>
                <td className="px-3 py-2 font-medium text-ink">{s.customerName}</td>
                <td className="px-3 py-2 text-muted-foreground">{s.salesEmployeeNameSnapshot ?? "—"}</td>
                <td className="px-3 py-2 text-center font-mono tabular-nums text-ink">{s._count.items}</td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/picking-slips/${s.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-500 hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" /> Xem
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
