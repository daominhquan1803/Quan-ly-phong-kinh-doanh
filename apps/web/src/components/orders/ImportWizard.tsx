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
        <div className="rounded-md bg-brandRed-50 text-brandRed-600 text-sm px-4 py-2.5">{error}</div>
      )}

      {step === "upload" && (
        <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-200 bg-white py-16 cursor-pointer hover:border-navy-900 transition-colors">
          <UploadCloud className="h-10 w-10 text-navy-900" />
          <div className="text-center">
            <p className="font-medium text-gray-900">Chọn hoặc kéo thả file Excel xuất từ AMIS</p>
            <p className="text-sm text-gray-500">Định dạng .xlsx hoặc .xls</p>
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
          {loading && <p className="text-sm text-gray-500">Đang đọc file...</p>}
        </label>
      )}

      {step === "mapping" && preview && (
        <div className="space-y-5">
          {preview.matchedTemplate ? (
            <div className="flex items-center gap-2 rounded-md bg-success-600/10 text-success-600 text-sm px-4 py-2.5">
              <CheckCircle2 className="h-4 w-4" />
              Đã nhận diện template &ldquo;{preview.matchedTemplate.name}&rdquo; — mapping được điền sẵn tự động.
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-warning-500/10 text-warning-500 text-sm px-4 py-2.5">
              <AlertTriangle className="h-4 w-4" />
              File mới, chưa có template khớp — hãy kiểm tra mapping gợi ý bên dưới trước khi tiếp tục.
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
            <h3 className="font-medium text-gray-900">Ánh xạ cột dữ liệu</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ORDER_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm text-gray-700 mb-1">
                    {field.label} {field.required && <span className="text-brandRed-600">*</span>}
                  </label>
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [field.key]: e.target.value || undefined }))
                    }
                    className="w-full text-sm rounded-md border border-gray-200 py-2 px-2 focus:outline-none focus:ring-2 focus:ring-navy-900"
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

          <div className="rounded-lg border border-gray-200 bg-white p-5 overflow-x-auto">
            <h3 className="font-medium text-gray-900 mb-3">
              Xem trước {preview.sampleRows.length} dòng đầu (tổng {preview.totalRows} dòng)
            </h3>
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  {preview.headers.map((h) => (
                    <th key={h} className="text-left font-medium px-2 py-1">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.sampleRows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1 text-gray-700">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!preview.matchedTemplate && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <label className="block text-sm text-gray-700 mb-1">
                Lưu mapping này làm template (tuỳ chọn, để lần sau tự nhận diện)
              </label>
              <input
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                placeholder="VD: Export đơn hàng AMIS chuẩn"
                className="w-full sm:w-96 text-sm rounded-md border border-gray-200 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-navy-900"
              />
            </div>
          )}

          {requiredMissing.length > 0 && (
            <p className="text-sm text-brandRed-600">
              Cần map đủ các cột bắt buộc: {requiredMissing.map((f) => f.label).join(", ")}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep("upload")}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Chọn file khác
            </button>
            <button
              onClick={handleCommit}
              disabled={loading || requiredMissing.length > 0}
              className="rounded-md bg-brandRed-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brandRed-700 disabled:opacity-50"
            >
              {loading ? "Đang nhập dữ liệu..." : `Nhập ${preview.totalRows} dòng`}
            </button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="kpi-card kpi-card--navy">
              <p className="text-sm text-gray-500">Tạo mới</p>
              <p className="text-2xl font-bold text-navy-900">{result.createdCount}</p>
            </div>
            <div className="kpi-card kpi-card--navy">
              <p className="text-sm text-gray-500">Cập nhật</p>
              <p className="text-2xl font-bold text-navy-900">{result.updatedCount}</p>
            </div>
            <div className="kpi-card kpi-card--red">
              <p className="text-sm text-gray-500">Lỗi</p>
              <p className="text-2xl font-bold text-brandRed-600">{result.errorCount}</p>
            </div>
            <div className="kpi-card kpi-card--red">
              <p className="text-sm text-gray-500">NV chưa khớp</p>
              <p className="text-2xl font-bold text-brandRed-600">{result.unmatchedEmployeeNames.length}</p>
            </div>
          </div>

          {result.unmatchedEmployeeNames.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="font-medium text-gray-900 mb-2">Tên nhân viên chưa khớp với tài khoản nào</h3>
              <p className="text-sm text-gray-500 mb-2">
                Vào Nhân viên → thêm alias để lần import sau tự khớp đúng.
              </p>
              <ul className="text-sm text-gray-700 list-disc pl-5">
                {result.unmatchedEmployeeNames.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h3 className="font-medium text-gray-900 mb-2">Chi tiết lỗi</h3>
              <ul className="text-sm text-brandRed-600 list-disc pl-5">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Dòng {e.rowNumber}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <a href="/orders" className="rounded-md bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
              Xem danh sách đơn hàng
            </a>
            <button
              onClick={() => {
                setStep("upload");
                setFile(null);
                setPreview(null);
                setResult(null);
              }}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Nhập file khác
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
