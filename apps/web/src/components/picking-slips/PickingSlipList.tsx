"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, FileText, Trash2, PackageCheck } from "lucide-react";
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
    <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-navy-900/50 shadow-card backdrop-blur-xl">
      <div className="flex items-center justify-between p-5 border-b border-gray-200/70 bg-gray-50/50">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(224,163,39,0.15)]">
            <PackageCheck className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold text-ink text-base">Danh sách phiếu soạn hàng</h2>
            <p className="text-xs text-muted2">Hỗ trợ kho nhặt hàng đúng theo từng đơn</p>
          </div>
        </div>

        <Link
          href="/picking-slips/new"
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brandRed-600 to-brandRed-700 px-4 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(200,16,46,0.35)] hover:from-brandRed-700 hover:to-brandRed-800 transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>Tạo phiếu mới</span>
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200/80 bg-gray-50/90 text-xs font-semibold uppercase tracking-wider text-ink2/70">
              <th className="px-5 py-3.5 text-left w-36">Số phiếu</th>
              <th className="px-5 py-3.5 text-left w-36">Ngày lập</th>
              <th className="px-5 py-3.5 text-left min-w-[220px]">Khách hàng</th>
              <th className="px-5 py-3.5 text-left w-48">Phụ trách</th>
              <th className="px-5 py-3.5 text-center w-32">Số dòng hàng</th>
              <th className="px-5 py-3.5 text-right w-36">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/40 text-sm">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                  Đang tải danh sách phiếu...
                </td>
              </tr>
            )}
            {!isLoading && (data?.slips.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                  <PackageCheck className="h-8 w-8 text-muted2 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium text-ink">Chưa có phiếu soạn hàng nào</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Bấm &quot;Tạo phiếu mới&quot; để xuất phiếu chuẩn bị hàng
                  </p>
                </td>
              </tr>
            )}
            {data?.slips.map((s) => (
              <tr key={s.id} className="hover:bg-navy-50/50 transition-colors group">
                <td className="px-5 py-3.5 align-middle">
                  <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-navy-100/90 border border-gray-300 text-amber-400 tracking-wide shadow-sm inline-block">
                    {s.slipNumber}
                  </span>
                </td>
                <td className="px-5 py-3.5 align-middle text-xs text-ink2 font-mono">
                  {formatDateVN(s.slipDate)}
                </td>
                <td className="px-5 py-3.5 align-middle font-medium text-ink">
                  {s.customerName}
                </td>
                <td className="px-5 py-3.5 align-middle text-xs text-ink2">
                  {s.salesEmployeeNameSnapshot ?? <span className="text-muted2">—</span>}
                </td>
                <td className="px-5 py-3.5 align-middle text-center">
                  <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-navy-100 border border-gray-300 font-mono text-xs font-semibold text-ink">
                    {s._count.items} dòng
                  </span>
                </td>
                <td className="px-5 py-3.5 align-middle text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/picking-slips/${s.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 px-2.5 py-1 rounded-lg border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                    >
                      <FileText className="h-3 w-3" /> Xem
                    </Link>
                    <button
                      onClick={() => handleDelete(s)}
                      disabled={deletingId === s.id}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-brandRed-50 hover:text-alert transition-colors disabled:opacity-40"
                      title="Xoá phiếu"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
