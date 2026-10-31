"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateVN } from "@/lib/utils";

interface Candidate {
  slipItemId: string;
  slipNumber: string;
  slipDate: string | null;
  slipCustomerName: string | null;
  itemCode: string | null;
  itemName: string;
  availableQty: number;
  defectReportItemId: string;
  defectItemName: string;
  remaining: number;
  sameCustomer: boolean;
}

const inputCls = "rounded-lg border border-white/10 bg-card px-2 py-1 text-xs font-mono text-ink w-24 focus:border-amber-500 focus:outline-none";

/** Admin tự nối phiếu đi hàng (không PO) vào biên bản đang mở: chọn dòng phiếu cùng mã hàng lỗi, nhập SL đổi, xác nhận. */
export function DefectSlipLinker({ defectId, onLinked }: { defectId: string; onLinked: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["defect-slip-candidates", defectId],
    queryFn: async () => {
      const res = await fetch(`/api/defects/${defectId}/slip-candidates`);
      if (!res.ok) throw new Error("Không tải được phiếu đổi lỗi");
      return (await res.json()) as { candidates: Candidate[] };
    },
  });
  const candidates = data?.candidates ?? [];
  const done = () => {
    queryClient.invalidateQueries({ queryKey: ["defect-slip-candidates", defectId] });
    queryClient.invalidateQueries({ queryKey: ["shipment-slip-issues"] });
    onLinked();
  };

  return (
    <div className="rounded-xl border border-emerald-500/30 p-3 space-y-2">
      <p className="text-sm font-semibold text-emerald-300">Nối phiếu đổi lỗi vào biên bản</p>
      <p className="text-xs text-muted2">Dòng phiếu đi hàng không có Số PO, cùng mã hàng lỗi, còn SL chưa nối (kể cả dòng đã bỏ qua).</p>
      {isLoading && <p className="text-xs text-muted2">Đang tìm...</p>}
      {!isLoading && candidates.length === 0 && <p className="text-xs text-muted2">Không có dòng phiếu nào phù hợp.</p>}
      {candidates.map((c) => (
        <CandidateRow key={`${c.slipItemId}/${c.defectReportItemId}`} c={c} onDone={done} />
      ))}
    </div>
  );
}

function CandidateRow({ c, onDone }: { c: Candidate; onDone: () => void }) {
  const [qty, setQty] = useState(String(Math.min(c.availableQty, c.remaining)));
  const [error, setError] = useState<string | null>(null);
  const link = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/shipment-slips/items/${c.slipItemId}/defect-replacement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defectReportItemId: c.defectReportItemId, quantity: Number(qty) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không nối được");
    },
    onSuccess: onDone,
    onError: (e) => setError(e instanceof Error ? e.message : "Không nối được"),
  });

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/5 p-2 text-xs">
      <span className="font-mono font-bold text-amber-400">{c.slipNumber}</span>
      <span className="text-muted2">{formatDateVN(c.slipDate)}</span>
      <span>{c.slipCustomerName ?? "—"}</span>
      {!c.sameCustomer && <span className="text-amber-300">(khác khách)</span>}
      <span>
        <span className="font-mono">{c.itemCode ?? "—"}</span> · {c.itemName} · còn <b>{c.availableQty.toLocaleString("vi-VN")}</b> chưa nối
      </span>
      <span className="text-muted2">→ {c.defectItemName} (còn thiếu {c.remaining.toLocaleString("vi-VN")})</span>
      <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" className={inputCls} aria-label="SL đổi" />
      <button
        disabled={!(Number(qty) > 0) || link.isPending}
        onClick={() => {
          setError(null);
          link.mutate();
        }}
        className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
      >
        {link.isPending ? "Đang lưu..." : "Nối"}
      </button>
      {error && <span className="text-alert">{error}</span>}
    </div>
  );
}
