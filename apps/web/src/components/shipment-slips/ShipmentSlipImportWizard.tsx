"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SHIPMENT_SLIP_FIELDS, ShipmentSlipFieldKey } from "@/lib/shipment-slip-fields";
import { UploadCloud, CheckCircle2, AlertTriangle } from "lucide-react";

interface PreviewResponse {
  sheetName: string;
  sheetNames: string[];
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  suggestedMapping: Partial<Record<ShipmentSlipFieldKey, string>>;
}

interface CommitResponse {
  batchId: string;
  totalSlips: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: { rowNumber: number; message: string }[];
  deliveryMatchedCount: number;
  deliveryUnmatchedItems: string[];
}

export function ShipmentSlipImportWizard() {
  const router = useRouter();
  const [step, setStep] = useState<"upload" | "mapping" | "result">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ShipmentSlipFieldKey, string>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResponse | null>(null);

  async function fetchPreview(f: File, sheetName?: string) {
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", f);
      if (sheetName) formData.append("sheetName", sheetName);
      const res = await fetch("/api/shipment-slips/import/preview", { method: "POST", body: formData });
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

  async function handleFileSelected(f: File) {
    setFile(f);
    await fetchPreview(f);
  }

  async function handleSheetChange(sheetName: string) {
    if (!file) return;
    await fetchPreview(file, sheetName);
  }

  async function handleCommit() {
    if (!file || !preview) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));
      formData.append("sheetName", preview.sheetName);

      const res = await fetch("/api/shipment-slips/import/commit", { method: "POST", body: formData });
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

  const requiredMissing = SHIPMENT_SLIP_FIELDS.filter((f) => f.required && !mapping[f.key]);

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-brandRed-50 text-brandRed-600 text-sm px-4 py-2.5">{error}</div>}

      {step === "upload" && (
        <div className="space-y-3">
          <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-200 bg-white py-12 cursor-pointer hover:border-navy-900 transition-colors">
            <UploadCloud className="h-8 w-8 text-navy-900" />
            <p className="font-medium text-gray-900 text-sm">Chọn file Excel phiếu đi hàng</p>
            <p className="text-xs text-gray-500">
              1 dòng = 1 mã hàng của 1 phiếu — các dòng cùng Số phiếu sẽ tự gộp thành 1 phiếu
            </p>
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
        </div>
      )}

      {step === "mapping" && preview && (
        <div className="space-y-4">
          {preview.sheetNames.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-700">Sheet dữ liệu:</label>
              <select
                value={preview.sheetName}
                onChange={(e) => handleSheetChange(e.target.value)}
                disabled={loading}
                className="input w-64"
              >
                {preview.sheetNames.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <h3 className="font-medium text-gray-900 text-sm">Ánh xạ cột dữ liệu</h3>
            <div className="grid grid-cols-2 gap-3">
              {SHIPMENT_SLIP_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="block text-xs text-gray-700 mb-1">
                    {field.label} {field.required && <span className="text-brandRed-600">*</span>}
                  </label>
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value || undefined }))}
                    className="input"
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

          <div className="rounded-lg border border-gray-200 bg-white p-4 overflow-x-auto">
            <p className="text-xs text-gray-500 mb-2">
              Xem trước {preview.sampleRows.length} dòng đầu (tổng {preview.totalRows} dòng, sheet &quot;
              {preview.sheetName}&quot;)
            </p>
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

          {requiredMissing.length > 0 && (
            <p className="text-sm text-brandRed-600">
              Cần map đủ các cột bắt buộc: {requiredMissing.map((f) => f.label).join(", ")}
            </p>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep("upload")} className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Chọn file khác
            </button>
            <button
              onClick={handleCommit}
              disabled={loading || requiredMissing.length > 0}
              className="rounded-md bg-brandRed-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brandRed-700 disabled:opacity-50"
            >
              {loading ? "Đang nhập..." : `Nhập ${preview.totalRows} dòng`}
            </button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="kpi-card kpi-card--navy">
              <p className="text-sm text-gray-500">Phiếu tạo mới</p>
              <p className="text-2xl font-bold text-navy-900">{result.createdCount}</p>
            </div>
            <div className="kpi-card kpi-card--navy">
              <p className="text-sm text-gray-500">Phiếu cập nhật</p>
              <p className="text-2xl font-bold text-navy-900">{result.updatedCount}</p>
            </div>
            <div className="kpi-card kpi-card--navy">
              <p className="text-sm text-gray-500">Tổng số phiếu</p>
              <p className="text-2xl font-bold text-navy-900">{result.totalSlips}</p>
            </div>
            <div className="kpi-card kpi-card--red">
              <p className="text-sm text-gray-500">Lỗi</p>
              <p className="text-2xl font-bold text-brandRed-600">{result.errorCount}</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
              <p className="font-medium text-gray-900 mb-2">Chi tiết lỗi (tối đa hiển thị 20 dòng):</p>
              <ul className="space-y-1 text-brandRed-600">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    Dòng {e.rowNumber}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-md bg-success-600/10 text-success-600 text-sm px-4 py-2.5">
            <CheckCircle2 className="h-4 w-4" /> Đã lưu vào danh sách Phiếu đi hàng.
          </div>
          <div className="flex items-center gap-2 rounded-md bg-success-600/10 text-success-600 text-sm px-4 py-2.5">
            <CheckCircle2 className="h-4 w-4" />
            Đã tự động ghi nhận {result.deliveryMatchedCount} dòng hàng vào Tiến độ giao hàng/Doanh số (khớp theo Số PO
            + Mã hàng).
          </div>
          {result.deliveryUnmatchedItems.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
              <p className="flex items-center gap-2 font-medium text-warning-500 mb-2">
                <AlertTriangle className="h-4 w-4" />
                {result.deliveryUnmatchedItems.length} dòng hàng không tự khớp được với PO tracking (chưa cập nhật
                vào Tiến độ giao hàng/Doanh số — kiểm tra lại Số PO/Mã hàng, hoặc dòng PO đó chưa có đơn giá):
              </p>
              <ul className="space-y-1 text-gray-700">
                {result.deliveryUnmatchedItems.slice(0, 20).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
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
      )}
    </div>
  );
}
