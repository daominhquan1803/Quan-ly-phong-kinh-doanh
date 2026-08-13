"use client";

import { useState } from "react";
import { SALES_PLAN_FIELDS, SalesPlanFieldKey } from "@/lib/sales-plan-fields";
import { UploadCloud, CheckCircle2 } from "lucide-react";

interface PreviewResponse {
  sheetName: string;
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  suggestedMapping: Partial<Record<SalesPlanFieldKey, string>>;
}

interface CommitResponse {
  batchId: string;
  totalRows: number;
  createdCount: number;
  errorCount: number;
  errors: { rowNumber: number; message: string }[];
  unmatchedEmployeeNames: string[];
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function SalesPlanImportWizard({ onDone }: { onDone: () => void }) {
  const now = new Date();
  const [step, setStep] = useState<"upload" | "mapping" | "result">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<SalesPlanFieldKey, string>>>({});
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
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
      const res = await fetch("/api/targets/plan/preview", { method: "POST", body: formData });
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
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));
      formData.append("year", String(year));
      formData.append("month", String(month));

      const res = await fetch("/api/targets/plan/commit", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import thất bại");
      setResult(json);
      setStep("result");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  const requiredMissing = SALES_PLAN_FIELDS.filter((f) => f.required && !mapping[f.key]);

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-brandRed-50 text-brandRed-600 text-sm px-4 py-2.5">{error}</div>}

      {step === "upload" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input w-32">
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input w-28">
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">Kế hoạch mới sẽ thay thế kế hoạch cũ của tháng này</span>
          </div>
          <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-200 bg-white py-12 cursor-pointer hover:border-navy-900 transition-colors">
            <UploadCloud className="h-8 w-8 text-navy-900" />
            <p className="font-medium text-gray-900 text-sm">Chọn file Excel kế hoạch kinh doanh</p>
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
          <div className="flex items-center gap-2 rounded-md bg-success-600/10 text-success-600 text-sm px-4 py-2.5">
            <CheckCircle2 className="h-4 w-4" />
            Áp dụng cho Tháng {month}/{year} — kiểm tra mapping gợi ý bên dưới trước khi tiếp tục.
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <h3 className="font-medium text-gray-900 text-sm">Ánh xạ cột dữ liệu</h3>
            <div className="grid grid-cols-2 gap-3">
              {SALES_PLAN_FIELDS.map((field) => (
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
              Xem trước {preview.sampleRows.length} dòng đầu (tổng {preview.totalRows} dòng)
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
          <div className="grid grid-cols-3 gap-4">
            <div className="kpi-card kpi-card--navy">
              <p className="text-sm text-gray-500">Đã nhập</p>
              <p className="text-2xl font-bold text-navy-900">{result.createdCount}</p>
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
            <p className="text-sm text-gray-700">
              Tên chưa khớp: {result.unmatchedEmployeeNames.join(", ")} — vào trang Nhân viên thêm alias.
            </p>
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
