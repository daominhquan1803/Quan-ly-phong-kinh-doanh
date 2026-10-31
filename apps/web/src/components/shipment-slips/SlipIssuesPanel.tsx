"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { formatDateVN } from "@/lib/utils";

interface Issue {
  itemId: string;
  slip: { id: string; slipNumber: string; slipDate: string | null; customerName: string | null };
  itemCode: string | null;
  itemName: string;
  poSaleNumber: string | null;
  qtyActual: number | null;
  kind: "NO_PO" | "NO_QTY" | "PO_NOT_FOUND" | "CODE_NOT_IN_PO";
  reason: string;
  suggestions: { poCode: string; itemCode: string; label: string }[];
  defectCandidates: { defectReportId: string; reportNumber: string; customerName: string | null; itemId: string; itemCode: string | null; itemName: string; remaining: number; sameCustomer: boolean }[];
}

const PAGE = 8;
const inputCls = "rounded-lg border border-gray-200/80 bg-navy-50/80 px-2 py-1 text-xs font-mono text-ink focus:border-amber-500 focus:outline-none w-36";

/** Bảng thông báo đầu trang Phiếu đi hàng (Admin): dòng phiếu chưa khớp PO / thiếu thông tin, sửa ngay tại chỗ. */
export function SlipIssuesPanel() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["shipment-slip-issues"],
    queryFn: async () => {
      const res = await fetch("/api/shipment-slips/issues");
      if (!res.ok) throw new Error("Không tải được danh sách dòng phiếu cần sửa");
      return (await res.json()) as { issues: Issue[] };
    },
  });
  const issues = data?.issues ?? [];
  if (isLoading || issues.length === 0) return null;
  const shown = showAll ? issues : issues.slice(0, PAGE);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["shipment-slip-issues"] });
    queryClient.invalidateQueries({ queryKey: ["shipment-slips"] });
    queryClient.invalidateQueries({ queryKey: ["shipping-status-summary"] });
    queryClient.invalidateQueries({ queryKey: ["defects"] });
  };

  return (
    <div className="rounded-2xl border border-warning-500/40 bg-warning-500/10 p-4 text-xs backdrop-blur-md">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left font-semibold text-warning-500">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {issues.length} dòng phiếu chưa ghi nhận được vào Tiến độ giao hàng — Admin sửa ngay (mã chưa khớp PO, thiếu Số PO, thiếu SL)
        </span>
        {open ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {shown.map((it) => (
            <IssueRow key={it.itemId} issue={it} onDone={refresh} />
          ))}
          {issues.length > PAGE && (
            <button onClick={() => setShowAll(!showAll)} className="text-xs font-semibold text-amber-400 hover:text-amber-300">
              {showAll ? "Thu gọn" : `Xem tất cả ${issues.length} dòng`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue, onDone }: { issue: Issue; onDone: () => void }) {
  const [po, setPo] = useState(issue.poSaleNumber ?? "");
  const [code, setCode] = useState(issue.itemCode ?? "");
  const [error, setError] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: async (body: { poSaleNumber?: string; itemCode?: string; ignored?: boolean }) => {
      const res = await fetch(`/api/shipment-slips/items/${issue.itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không lưu được");
    },
    onSuccess: onDone,
    onError: (e) => setError(e instanceof Error ? e.message : "Không lưu được"),
  });

  const cands = issue.defectCandidates ?? [];
  const [defectItemId, setDefectItemId] = useState(cands[0]?.itemId ?? "");
  const picked = cands.find((c) => c.itemId === defectItemId);
  const [replaceQty, setReplaceQty] = useState(String(Math.min(issue.qtyActual ?? 0, cands[0]?.remaining ?? 0) || ""));
  const replace = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/shipment-slips/items/${issue.itemId}/defect-replacement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defectReportItemId: defectItemId, quantity: Number(replaceQty) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Không xác nhận được");
    },
    onSuccess: onDone,
    onError: (e) => setError(e instanceof Error ? e.message : "Không xác nhận được"),
  });

  const canSave = po.trim() !== "" && code.trim() !== "" && (po.trim() !== issue.poSaleNumber || code.trim() !== issue.itemCode);
  const editable = issue.kind !== "NO_QTY";

  return (
    <div className="rounded-xl border border-gray-200/30 bg-navy-900/50 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={`/shipment-slips/${issue.slip.id}`} className="font-mono font-bold text-amber-400 hover:text-amber-300">
          {issue.slip.slipNumber}
        </Link>
        <span className="text-muted-foreground">{formatDateVN(issue.slip.slipDate)}</span>
        <span className="font-medium text-ink">{issue.slip.customerName ?? "—"}</span>
        <span className="font-semibold text-alert">{issue.reason}</span>
      </div>
      <p className="mt-1 text-ink2">
        <span className="font-mono text-amber-300">{issue.itemCode ?? "(không mã)"}</span> · {issue.itemName} · SL thực xuất{" "}
        <strong>{issue.qtyActual ?? "—"}</strong>
        {issue.poSaleNumber && (
          <>
            {" "}
            · PO <span className="font-mono">{issue.poSaleNumber}</span>
          </>
        )}
      </p>
      {editable && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={po} onChange={(e) => setPo(e.target.value)} placeholder="Số PO (D10.26...)" className={inputCls} aria-label="Số PO" />
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Mã hàng" className={inputCls} aria-label="Mã hàng" />
          <button
            disabled={!canSave || patch.isPending}
            onClick={() => {
              setError(null);
              patch.mutate({ poSaleNumber: po.trim(), itemCode: code.trim() });
            }}
            className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-amber-foreground disabled:opacity-40"
          >
            {patch.isPending ? "Đang lưu..." : "Lưu & khớp lại"}
          </button>
        </div>
      )}
      {editable && issue.suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">Gợi ý:</span>
          {issue.suggestions.map((s) => (
            <button
              key={`${s.poCode}/${s.itemCode}`}
              onClick={() => {
                setPo(s.poCode);
                setCode(s.itemCode);
              }}
              className="rounded-md border border-gray-200/40 px-2 py-0.5 font-mono text-[11px] text-ink2 hover:bg-white/5"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {cands.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2">
          <span className="font-semibold text-emerald-300">Đổi lỗi theo biên bản:</span>
          <select
            value={defectItemId}
            onChange={(e) => {
              setDefectItemId(e.target.value);
              const c = cands.find((x) => x.itemId === e.target.value);
              setReplaceQty(String(Math.min(issue.qtyActual ?? 0, c?.remaining ?? 0) || ""));
            }}
            className={`${inputCls} w-auto`}
            aria-label="Biên bản hàng lỗi"
          >
            {cands.map((c) => (
              <option key={c.itemId} value={c.itemId}>
                {c.reportNumber} · {c.customerName ?? "—"} · còn thiếu {c.remaining}
                {c.sameCustomer ? "" : " (khác khách)"}
              </option>
            ))}
          </select>
          <input value={replaceQty} onChange={(e) => setReplaceQty(e.target.value)} inputMode="decimal" className={`${inputCls} w-24`} aria-label="SL đổi" />
          <button
            disabled={!picked || !(Number(replaceQty) > 0) || replace.isPending}
            onClick={() => {
              setError(null);
              replace.mutate();
            }}
            className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
          >
            {replace.isPending ? "Đang lưu..." : "Xác nhận đổi lỗi"}
          </button>
        </div>
      )}
      <div className="mt-2 flex items-center gap-3">
        <button
          disabled={patch.isPending}
          onClick={() => patch.mutate({ ignored: true })}
          className="text-[11px] font-semibold text-muted-foreground underline hover:text-ink"
          title="Hàng bù hao (tặng khách) hoặc không có PO — không báo nữa, không tính doanh số"
        >
          Hàng tặng / bù hao (bỏ qua)
        </button>
        {error && <span className="text-alert">{error}</span>}
      </div>
    </div>
  );
}
