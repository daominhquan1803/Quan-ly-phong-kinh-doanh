"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ORDER_FIELDS, ColumnMapping } from "@/lib/column-mapper";
import { UploadCloud, CheckCircle2, AlertTriangle } from "lucide-react";

interface PreviewResponse {
  sheetName: string;
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  headerHash: string;
  matchedTemplate: { id: string; name: string } | null;
  suggestedMapping: ColumnMapping;
}

interface CommitResponse {
  batchId: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: { rowNumber: number; message: string }[];
  unmatchedEmployeeNames: string[];
}

type Step = "upload" | "mapping" | "result";

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResponse | null>(null);

  async function handleFileSelected(f: File) {
    setFile(f);
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", f);
      const res = await fetch("/api/orders/import/preview", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Không đọc được file");
      setPreview(json);
      setMapping(json.suggestedMapping ?? {});
      setStep("mapping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file || !preview) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));
      formData.append("headerHash", preview.headerHash);
      if (saveTemplateName.trim()) formData.append("saveTemplateName", saveTemplateName.trim());
      if (preview.matchedTemplate) formData.append("templateId", preview.matchedTemplate.id);

      const res = await fetch("/api/orders/import/commit", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import thất bại");
      setResult(json);
      setStep("result");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  const requiredMissing = ORDER_FIELDS.filter((f) => f.required && !mapping[f.key]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs px-4 py-3">
          {error}
        </div>
      )}

      {step === "upload" && (
        <label className="flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-white/20 bg-white/[0.02] hover:bg-white/[0.05] hover:border-amber-400/50 py-16 px-6 cursor-pointer transition-all group shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(245,158,11,0.2)]">
            <UploadCloud className="h-10 w-10" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-white group-hover:text-amber-400 transition-colors">
              Chọn hoặc kéo thả file Excel AMIS vào đây
            </p>
            <p className="text-xs text-gray-400 mt-1">Định dạng hỗ trợ: .xlsx hoặc .xls</p>
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
            <div className="flex items-center gap-2 text-xs text-amber-400 mt-2">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              Đang phân tích cấu trúc file...
            </div>
          )}
        </label>
      )}

      {step === "mapping" && preview && (
        <div className="space-y-6">
          {preview.matchedTemplate ? (
            <div className="flex items-center gap-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Đã nhận diện template &ldquo;{preview.matchedTemplate.name}&rdquo; — mapping được điền sẵn tự động.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs px-4 py-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>File mới, chưa có template khớp — vui lòng kiểm tra cột dữ liệu gợi ý trước khi tiếp tục.</span>
            </div>
          )}

          <div className="glass-card border border-white/10 rounded-2xl p-6 space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
            <h3 className="text-base font-semibold text-white tracking-wide">Ánh Xạ Cột Dữ Liệu</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ORDER_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-gray-300 mb-1.5">
                    {field.label} {field.required && <span className="text-rose-400">*</span>}
                  </label>
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [field.key]: e.target.value || undefined }))
                    }
                    className="w-full text-xs bg-gray-100 text-white rounded-xl border border-white/15 py-2 px-3 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60"
                  >
                    <option value="">— Không chọn —</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card border border-white/10 rounded-2xl p-6 overflow-x-auto shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
            <h3 className="text-base font-semibold text-white mb-3 tracking-wide">
              Xem trước {preview.sampleRows.length} dòng đầu (tổng {preview.totalRows} dòng)
            </h3>
            <table className="min-w-full text-xs">
              <thead className="bg-white/[0.03] border-b border-white/10 text-gray-400 uppercase tracking-wider font-semibold">
                <tr>
                  {preview.headers.map((h) => (
                    <th key={h} className="text-left py-2.5 px-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {preview.sampleRows.map((row, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    {row.map((cell, j) => (
                      <td key={j} className="py-2 px-3 text-gray-300 font-mono whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!preview.matchedTemplate && (
            <div className="glass-card border border-white/10 rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Lưu cấu hình mapping này làm mẫu (tuỳ chọn, để lần sau tự nhận diện):
              </label>
              <input
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                placeholder="VD: Export đơn hàng AMIS chuẩn"
                className="w-full sm:w-96 text-xs bg-white/[0.05] text-white rounded-xl border border-white/15 py-2 px-3 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          )}

          {requiredMissing.length > 0 && (
            <p className="text-xs text-rose-400">
              ⚠️ Cần chọn đầy đủ các cột bắt buộc: {requiredMissing.map((f) => f.label).join(", ")}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => setStep("upload")}
              className="rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] px-4 py-2 text-xs font-medium text-gray-300 transition-colors"
            >
              ← Chọn file khác
            </button>
            <button
              onClick={handleCommit}
              disabled={loading || requiredMissing.length > 0}
              className="rounded-xl bg-gradient-to-r from-brandRed-600 to-amber-600 hover:from-brandRed-500 hover:to-amber-500 px-5 py-2.5 text-xs font-semibold text-white shadow-[0_0_20px_rgba(225,29,72,0.3)] border border-brandRed-500/40 disabled:opacity-50 transition-all"
            >
              {loading ? "Đang nhập dữ liệu..." : `Xác Nhận Nhập ${preview.totalRows} Dòng`}
            </button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="glass-card border border-white/10 rounded-2xl p-5 relative overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-500 absolute top-0 left-0" />
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-400">Tạo mới</p>
              <p className="text-3xl font-bold font-mono text-emerald-400 mt-1">{result.createdCount}</p>
            </div>
            <div className="glass-card border border-white/10 rounded-2xl p-5 relative overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-cyan-500 absolute top-0 left-0" />
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-400">Cập nhật</p>
              <p className="text-3xl font-bold font-mono text-blue-400 mt-1">{result.updatedCount}</p>
            </div>
            <div className="glass-card border border-white/10 rounded-2xl p-5 relative overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-rose-500 to-red-600 absolute top-0 left-0" />
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-400">Lỗi</p>
              <p className="text-3xl font-bold font-mono text-rose-400 mt-1">{result.errorCount}</p>
            </div>
            <div className="glass-card border border-white/10 rounded-2xl p-5 relative overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-amber-500 to-orange-500 absolute top-0 left-0" />
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-400">NV chưa khớp</p>
              <p className="text-3xl font-bold font-mono text-amber-400 mt-1">{result.unmatchedEmployeeNames.length}</p>
            </div>
          </div>

          {result.unmatchedEmployeeNames.length > 0 && (
            <div className="glass-card border border-amber-500/30 bg-amber-500/5 rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-semibold text-amber-400">Tên nhân viên chưa khớp với tài khoản nào</h3>
              <p className="text-xs text-gray-400">
                Vào mục Quản lý nhân viên → Ánh xạ tên (alias) để lần import sau tự khớp đúng.
              </p>
              <ul className="text-xs text-white list-disc pl-5 font-mono">
                {result.unmatchedEmployeeNames.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="glass-card border border-rose-500/30 bg-rose-500/5 rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-semibold text-rose-400">Chi tiết lỗi</h3>
              <ul className="text-xs text-rose-300 list-disc pl-5 font-mono">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Dòng {e.rowNumber}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href="/orders"
              className="rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-xs font-semibold text-gray-950 shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all"
            >
              Xem danh sách đơn hàng
            </a>
            <button
              onClick={() => {
                setStep("upload");
                setFile(null);
                setPreview(null);
                setResult(null);
              }}
              className="rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] px-4 py-2 text-xs font-medium text-gray-300 transition-colors"
            >
              Nhập file khác
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
