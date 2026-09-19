"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn, formatCurrencyVND, formatDateVN } from "@/lib/utils";
import { UploadCloud, X, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface PreviewRow {
  rowNumber: number;
  paymentDate: string | null;
  customerCodeRaw: string | null;
  customerName: string | null;
  rawDescription: string | null;
  amount: number;
  matchStatus: "MATCHED" | "PARTIAL" | "UNMATCHED";
  unallocatedAmount: number;
  isDuplicate: boolean;
}
interface PreviewResponse {
  totalRows: number;
  errorCount: number;
  errors: { rowNumber: number; message: string }[];
  rows: PreviewRow[];
  summary: { matched: number; partial: number; unmatched: number; duplicate: number };
}
interface CommitResponse {
  totalRows: number;
  matchedCount: number;
  partialCount: number;
  unmatchedCount: number;
  duplicateSkippedCount: number;
  errorCount: number;
}

const MATCH_LABEL: Record<PreviewRow["matchStatus"], string> = {
  MATCHED: "Đã khớp",
  PARTIAL: "Khớp 1 phần",
  UNMATCHED: "Chưa khớp",
};
const MATCH_ICON: Record<PreviewRow["matchStatus"], React.ReactNode> = {
  MATCHED: <CheckCircle2 className="h-3.5 w-3.5 text-success-600" />,
  PARTIAL: <AlertTriangle className="h-3.5 w-3.5 text-warning-500" />,
  UNMATCHED: <XCircle className="h-3.5 w-3.5 text-brandRed-600" />,
};

export function DebtPaymentsImportWizard({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(f: File) {
    setFile(f);
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", f);
      const res = await fetch("/api/debt/import/payments/preview", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Không đọc được file");
      setPreview(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/debt/import/payments/commit", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ghi nhận thất bại");
      setResult(json);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["debt-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["debt-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["debt-unmatched-payments"] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto glass-card border border-white/10 p-6 space-y-5 relative shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-[0_0_12px_rgba(224,163,39,0.3)]">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-ink text-base">Cập nhật Tiền về</h3>
              <p className="text-xs text-muted2">Đối soát và ghi nhận sao kê thanh toán ngân hàng vào công nợ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-ink hover:bg-white/5 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-brandRed-500/30 bg-brandRed-500/10 text-brandRed-400 text-sm px-4 py-3 flex items-center gap-2 shadow-[0_0_12px_rgba(200,16,46,0.15)]">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!preview && !result && (
          <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.04] py-14 cursor-pointer hover:border-amber-500/60 transition-all group">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 group-hover:scale-110 group-hover:border-amber-500/40 group-hover:shadow-[0_0_20px_rgba(224,163,39,0.3)] transition-all">
              <UploadCloud className="h-8 w-8 text-amber-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-ink text-sm group-hover:text-amber-300 transition-colors">
                Kéo thả hoặc bấm để chọn file Excel Tiền về
              </p>
              <p className="text-xs text-muted2 mt-1">Định dạng .xlsx, .xls</p>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelected(f);
              }}
            />
            {loading && (
              <div className="flex items-center gap-2 text-sm text-amber-400 mt-2">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                Đang đọc dữ liệu...
              </div>
            )}
          </label>
        )}

        {preview && !result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="glass-card border border-emerald-500/30 bg-emerald-500/[0.04] !p-3.5 rounded-xl">
                <p className="text-xs text-muted2">Đã khớp</p>
                <p className="text-xl font-bold font-mono text-emerald-400 mt-1">{preview.summary.matched}</p>
              </div>
              <div className="glass-card border border-amber-500/30 bg-amber-500/[0.04] !p-3.5 rounded-xl">
                <p className="text-xs text-muted2">Khớp 1 phần</p>
                <p className="text-xl font-bold font-mono text-amber-400 mt-1">{preview.summary.partial}</p>
              </div>
              <div className="glass-card border border-brandRed-500/30 bg-brandRed-500/[0.04] !p-3.5 rounded-xl">
                <p className="text-xs text-muted2">Chưa khớp</p>
                <p className="text-xl font-bold font-mono text-brandRed-400 mt-1">{preview.summary.unmatched}</p>
              </div>
              <div className="glass-card border border-white/10 bg-white/[0.02] !p-3.5 rounded-xl">
                <p className="text-xs text-muted2">Trùng lặp</p>
                <p className="text-xl font-bold font-mono text-muted-foreground mt-1">{preview.summary.duplicate}</p>
              </div>
            </div>

            {preview.summary.duplicate > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {preview.summary.duplicate} dòng đã được ghi nhận trước đó — sẽ tự động bỏ qua khi ghi nhận, không cộng trùng.
                </span>
              </div>
            )}

            <div className="rounded-xl border border-white/5 bg-black/40 overflow-x-auto max-h-80">
              <table className="min-w-full text-xs">
                <thead className="bg-white/[0.04] text-muted-foreground sticky top-0 backdrop-blur-md border-b border-white/5">
                  <tr>
                    <th className="text-left font-medium px-3.5 py-2.5">Ngày</th>
                    <th className="text-left font-medium px-3.5 py-2.5">Khách hàng</th>
                    <th className="text-right font-medium px-3.5 py-2.5">Số tiền</th>
                    <th className="text-left font-medium px-3.5 py-2.5">Khớp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {preview.rows.map((r) => (
                    <tr key={r.rowNumber} className={cn("hover:bg-white/[0.02] transition-colors", r.isDuplicate && "opacity-40")}>
                      <td className="px-3.5 py-2 font-mono text-muted2">{formatDateVN(r.paymentDate)}</td>
                      <td className="px-3.5 py-2 font-medium text-ink">{r.customerName ?? r.customerCodeRaw ?? "—"}</td>
                      <td className="px-3.5 py-2 text-right font-mono font-medium text-ink">{formatCurrencyVND(r.amount)}</td>
                      <td className="px-3.5 py-2">
                        {r.isDuplicate ? (
                          <span className="inline-flex items-center gap-1 text-muted2">
                            <AlertTriangle className="h-3.5 w-3.5" /> Trùng lặp
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            {MATCH_ICON[r.matchStatus]}
                            <span className="font-medium">{MATCH_LABEL[r.matchStatus]}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.errorCount > 0 && (
              <p className="text-xs text-brandRed-400">{preview.errorCount} dòng lỗi sẽ bị bỏ qua khi ghi nhận.</p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                }}
                className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-ink text-sm font-medium transition-colors"
              >
                Chọn file khác
              </button>
              <button
                onClick={handleCommit}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-brandRed-600 to-brandRed-700 hover:from-brandRed-500 hover:to-brandRed-600 text-white text-sm font-semibold shadow-[0_0_20px_rgba(200,16,46,0.35)] disabled:opacity-50 transition-all"
              >
                {loading ? "Đang ghi nhận..." : `Ghi nhận ${preview.totalRows} giao dịch`}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="glass-card border border-emerald-500/30 bg-emerald-500/[0.04] !p-3.5 rounded-xl">
                <p className="text-xs text-muted2">Đã khớp</p>
                <p className="text-xl font-bold font-mono text-emerald-400 mt-1">{result.matchedCount}</p>
              </div>
              <div className="glass-card border border-amber-500/30 bg-amber-500/[0.04] !p-3.5 rounded-xl">
                <p className="text-xs text-muted2">Khớp 1 phần</p>
                <p className="text-xl font-bold font-mono text-amber-400 mt-1">{result.partialCount}</p>
              </div>
              <div className="glass-card border border-brandRed-500/30 bg-brandRed-500/[0.04] !p-3.5 rounded-xl">
                <p className="text-xs text-muted2">Chưa khớp</p>
                <p className="text-xl font-bold font-mono text-brandRed-400 mt-1">{result.unmatchedCount}</p>
              </div>
              <div className="glass-card border border-white/10 bg-white/[0.02] !p-3.5 rounded-xl">
                <p className="text-xs text-muted2">Trùng lặp (bỏ qua)</p>
                <p className="text-xl font-bold font-mono text-muted-foreground mt-1">{result.duplicateSkippedCount}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-sm px-4 py-3 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>
                Đã ghi nhận thành công {result.totalRows - result.duplicateSkippedCount} giao dịch mới vào Công nợ
                {result.duplicateSkippedCount > 0 && ` (bỏ qua ${result.duplicateSkippedCount} dòng trùng lặp)`}.
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

