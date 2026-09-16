"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrencyVND, formatDateVN } from "@/lib/utils";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink">Cập nhật Tiền về</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <div className="rounded-md bg-brandRed-50 text-brandRed-600 text-sm px-4 py-2.5">{error}</div>}

        {!preview && !result && (
          <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-200 py-12 cursor-pointer hover:border-amber-500 transition-colors">
            <UploadCloud className="h-8 w-8 text-ink" />
            <p className="font-medium text-ink text-sm">Chọn file Excel Tiền về</p>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelected(f);
              }}
            />
            {loading && <p className="text-sm text-muted-foreground">Đang đọc file...</p>}
          </label>
        )}

        {preview && !result && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <div className="kpi-card kpi-card--navy !p-3">
                <p className="text-xs text-muted-foreground">Đã khớp</p>
                <p className="text-lg font-bold text-success-600">{preview.summary.matched}</p>
              </div>
              <div className="kpi-card kpi-card--navy !p-3">
                <p className="text-xs text-muted-foreground">Khớp 1 phần</p>
                <p className="text-lg font-bold text-warning-500">{preview.summary.partial}</p>
              </div>
              <div className="kpi-card kpi-card--red !p-3">
                <p className="text-xs text-muted-foreground">Chưa khớp</p>
                <p className="text-lg font-bold text-brandRed-600">{preview.summary.unmatched}</p>
              </div>
              <div className="kpi-card kpi-card--red !p-3">
                <p className="text-xs text-muted-foreground">Trùng lặp</p>
                <p className="text-lg font-bold text-brandRed-600">{preview.summary.duplicate}</p>
              </div>
            </div>
            {preview.summary.duplicate > 0 && (
              <p className="flex items-center gap-1.5 text-sm text-warning-500">
                <AlertTriangle className="h-4 w-4" />
                {preview.summary.duplicate} dòng đã được ghi nhận trước đó (trùng ngày + khách hàng + số tiền + mô tả) — sẽ tự
                động bỏ qua khi bấm Ghi nhận, không cộng trùng.
              </p>
            )}
            <div className="rounded-lg border border-gray-200 overflow-x-auto max-h-96">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Ngày</th>
                    <th className="text-left font-medium px-3 py-2">Khách hàng</th>
                    <th className="text-right font-medium px-3 py-2">Số tiền</th>
                    <th className="text-left font-medium px-3 py-2">Khớp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.rows.map((r) => (
                    <tr key={r.rowNumber} className={r.isDuplicate ? "opacity-50" : undefined}>
                      <td className="px-3 py-1.5">{formatDateVN(r.paymentDate)}</td>
                      <td className="px-3 py-1.5">{r.customerName ?? r.customerCodeRaw ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrencyVND(r.amount)}</td>
                      <td className="px-3 py-1.5">
                        {r.isDuplicate ? (
                          <span className="inline-flex items-center gap-1 text-brandRed-600">
                            <AlertTriangle className="h-3.5 w-3.5" /> Trùng lặp — bỏ qua
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            {MATCH_ICON[r.matchStatus]} {MATCH_LABEL[r.matchStatus]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.errorCount > 0 && (
              <p className="text-sm text-brandRed-600">{preview.errorCount} dòng lỗi sẽ bị bỏ qua khi ghi nhận.</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                }}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-ink2 hover:bg-gray-50"
              >
                Chọn file khác
              </button>
              <button
                onClick={handleCommit}
                disabled={loading}
                className="rounded-md bg-brandRed-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brandRed-700 disabled:opacity-50"
              >
                {loading ? "Đang ghi nhận..." : `Ghi nhận ${preview.totalRows} giao dịch`}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="kpi-card kpi-card--navy !p-3">
                <p className="text-xs text-muted-foreground">Đã khớp</p>
                <p className="text-lg font-bold text-success-600">{result.matchedCount}</p>
              </div>
              <div className="kpi-card kpi-card--navy !p-3">
                <p className="text-xs text-muted-foreground">Khớp 1 phần</p>
                <p className="text-lg font-bold text-warning-500">{result.partialCount}</p>
              </div>
              <div className="kpi-card kpi-card--red !p-3">
                <p className="text-xs text-muted-foreground">Chưa khớp</p>
                <p className="text-lg font-bold text-brandRed-600">{result.unmatchedCount}</p>
              </div>
              <div className="kpi-card kpi-card--red !p-3">
                <p className="text-xs text-muted-foreground">Trùng lặp (bỏ qua)</p>
                <p className="text-lg font-bold text-brandRed-600">{result.duplicateSkippedCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-success-600/10 text-success-600 text-sm px-4 py-2.5">
              <CheckCircle2 className="h-4 w-4" /> Đã ghi nhận {result.totalRows - result.duplicateSkippedCount} giao dịch
              mới vào Công nợ{result.duplicateSkippedCount > 0 && ` (bỏ qua ${result.duplicateSkippedCount} dòng trùng lặp)`}.
            </div>
            <button onClick={onClose} className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-ink2 hover:bg-gray-50">
              Đóng
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
