"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, FileText, Trash2 } from "lucide-react";
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
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["picking-slips"],
    queryFn: async () => {
      const res = await fetch("/api/picking-slips");
      if (!res.ok) throw new Error("Không tải được danh sách");
      return res.json() as Promise<{ slips: SlipRow[] }>;
    },
  });

  async function handleDelete(slip: SlipRow) {
    if (!confirm(`Xoá phiếu ${slip.slipNumber} (${slip.customerName})? Không thể hoàn tác.`)) return;
    setDeletingId(slip.id);
    const res = await fetch(`/api/picking-slips/${slip.id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["picking-slips"] });
    } else {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Không xoá được phiếu");
    }
  }

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
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link
                    href={`/picking-slips/${s.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-500 hover:underline mr-3"
                  >
                    <FileText className="h-3.5 w-3.5" /> Xem
                  </Link>
                  <button
                    onClick={() => handleDelete(s)}
                    disabled={deletingId === s.id}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted2 hover:text-brandRed-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Xoá
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
