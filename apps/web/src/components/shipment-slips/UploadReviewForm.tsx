"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Plus, Trash2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { OrderPicker } from "./OrderPicker";

interface ItemRow {
  itemCode: string;
  itemName: string;
  warehouse: string;
  poSaleNumber: string;
  unit: string;
  qtyRequested: string;
  qtyActual: string;
  poCustomerItemCode: string;
  note: string;
}

const EMPTY_ITEM: ItemRow = {
  itemCode: "",
  itemName: "",
  warehouse: "",
  poSaleNumber: "",
  unit: "",
  qtyRequested: "",
  qtyActual: "",
  poCustomerItemCode: "",
  note: "",
};

interface OcrResult {
  slipNumber?: string;
  slipDate?: string;
  receiverName?: string;
  customerName?: string;
  deliveryAddress?: string;
  description?: string;
  paymentMethod?: string;
  preparedBy?: string;
  items: Partial<ItemRow>[];
  lowConfidenceFields: string[];
}

export function UploadReviewForm() {
  const router = useRouter();
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageThumbPath, setImageThumbPath] = useState<string | null>(null);
  const [ocrRawResponse, setOcrRawResponse] = useState<unknown>(null);
  const [lowConfidence, setLowConfidence] = useState<string[]>([]);

  const [slipNumber, setSlipNumber] = useState("");
  const [slipDate, setSlipDate] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);

  async function handleFileSelected(file: File) {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/shipment-slips/ocr", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Không xử lý được file");

      setImagePath(json.imagePath);
      setImageThumbPath(json.imageThumbPath);

      if (json.ocr) {
        const ocr = json.ocr as OcrResult;
        setSlipNumber(ocr.slipNumber ?? "");
        setSlipDate(ocr.slipDate ?? "");
        setReceiverName(ocr.receiverName ?? "");
        setCustomerName(ocr.customerName ?? "");
        setDeliveryAddress(ocr.deliveryAddress ?? "");
        setDescription(ocr.description ?? "");
        setPaymentMethod(ocr.paymentMethod ?? "");
        setPreparedBy(ocr.preparedBy ?? "");
        setLowConfidence(ocr.lowConfidenceFields ?? []);
        setItems(
          ocr.items.length
            ? ocr.items.map((it) => ({
                itemCode: it.itemCode ?? "",
                itemName: it.itemName ?? "",
                warehouse: it.warehouse ?? "",
                poSaleNumber: it.poSaleNumber ?? "",
                unit: it.unit ?? "",
                qtyRequested: it.qtyRequested != null ? String(it.qtyRequested) : "",
                qtyActual: it.qtyActual != null ? String(it.qtyActual) : "",
                poCustomerItemCode: it.poCustomerItemCode ?? "",
                note: it.note ?? "",
              }))
            : [{ ...EMPTY_ITEM }]
        );
      } else if (json.ocrError) {
        setError(`AI đọc ảnh thất bại: ${json.ocrError}. Vui lòng nhập tay bên dưới.`);
      }
      setOcrRawResponse(json.ocrRawResponse ?? null);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  function updateItem(i: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        slipNumber,
        slipDate: slipDate ? new Date(slipDate).toISOString() : null,
        receiverName: receiverName || null,
        customerName: customerName || null,
        deliveryAddress: deliveryAddress || null,
        description: description || null,
        paymentMethod: paymentMethod || null,
        preparedBy: preparedBy || null,
        imagePath,
        imageThumbPath,
        orderId,
        ocrRawResponse,
        ocrConfidenceNote: lowConfidence,
        items: items
          .filter((it) => it.itemName.trim())
          .map((it) => ({
            itemCode: it.itemCode || null,
            itemName: it.itemName,
            warehouse: it.warehouse || null,
            poSaleNumber: it.poSaleNumber || null,
            unit: it.unit || null,
            qtyRequested: it.qtyRequested ? Number(it.qtyRequested) : null,
            qtyActual: it.qtyActual ? Number(it.qtyActual) : null,
            poCustomerItemCode: it.poCustomerItemCode || null,
            note: it.note || null,
          })),
      };

      const res = await fetch("/api/shipment-slips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Lưu thất bại");

      router.push(`/shipment-slips/${json.slip.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  const isLow = (field: string) => lowConfidence.includes(field);

  if (step === "upload") {
    return (
      <div className="max-w-2xl mx-auto">
        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs px-4 py-3 mb-4">
            {error}
          </div>
        )}
        <label className="flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-white/20 bg-white/[0.02] hover:bg-white/[0.05] hover:border-amber-400/50 py-16 px-6 cursor-pointer transition-all group shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(245,158,11,0.2)]">
            <UploadCloud className="h-10 w-10" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-white group-hover:text-amber-400 transition-colors">
              Chụp ảnh, chọn ảnh, file PDF hoặc file .txt phiếu xuất kho
            </p>
            <p className="text-xs text-gray-400 mt-1">
              AI sẽ tự động đọc, trích xuất mã hàng, số lượng và điền sẵn để bạn rà soát
            </p>
          </div>
          <input
            type="file"
            accept="image/*,application/pdf,text/plain,.txt"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelected(f);
            }}
          />
          {loading && (
            <div className="flex items-center gap-2 text-xs text-amber-400 mt-2">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              AI đang phân tích và nhận diện hình ảnh chứng từ...
            </div>
          )}
        </label>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-5">
        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs px-4 py-3">
            {error}
          </div>
        )}
        {lowConfidence.length > 0 && (
          <div className="flex items-center gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>AI không chắc chắn ở một số trường (viền vàng) — vui lòng đối chiếu với ảnh chứng từ bên cạnh.</span>
          </div>
        )}

        <div className="glass-card border border-white/10 rounded-2xl p-6 space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-amber-400 border-b border-white/10 pb-2">
            Thông Tin Phiếu Xuất
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Số phiếu *" low={isLow("slipNumber")}>
              <input
                value={slipNumber}
                onChange={(e) => setSlipNumber(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500/60"
              />
            </Field>
            <Field label="Ngày lập phiếu" low={isLow("slipDate")}>
              <input
                type="date"
                value={slipDate}
                onChange={(e) => setSlipDate(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/60"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Người nhận hàng" low={isLow("receiverName")}>
              <input
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/60"
              />
            </Field>
            <Field label="Khách hàng *" low={isLow("customerName")}>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/60"
              />
            </Field>
          </div>
          <Field label="Địa chỉ giao hàng" low={isLow("deliveryAddress")}>
            <input
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/60"
            />
          </Field>
          <Field label="Diễn giải xuất hàng" low={isLow("description")}>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/60"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Hình thức thanh toán" low={isLow("paymentMethod")}>
              <input
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/60"
              />
            </Field>
            <Field label="Người lập phiếu" low={isLow("preparedBy")}>
              <input
                value={preparedBy}
                onChange={(e) => setPreparedBy(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/60"
              />
            </Field>
          </div>
          <Field label="Liên kết đơn hàng (tuỳ chọn)">
            <OrderPicker value={orderId} onChange={setOrderId} initialQuery={customerName} />
          </Field>
        </div>

        <div className="glass-card border border-white/10 rounded-2xl p-6 space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-white">
              Chi Tiết Hàng Hóa Xuất Kho ({items.length} mặt hàng)
            </h3>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-lg transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm dòng
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-amber-400"># Dòng {i + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-1 rounded text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <input
                    placeholder="Mã hàng"
                    value={item.itemCode}
                    onChange={(e) => updateItem(i, { itemCode: e.target.value })}
                    className="bg-white/[0.05] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 font-mono focus:outline-none focus:border-amber-500/60"
                  />
                  <input
                    placeholder="Tên hàng *"
                    value={item.itemName}
                    onChange={(e) => updateItem(i, { itemName: e.target.value })}
                    className="col-span-2 sm:col-span-3 bg-white/[0.05] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/60"
                  />
                  <input
                    placeholder="Kho"
                    value={item.warehouse}
                    onChange={(e) => updateItem(i, { warehouse: e.target.value })}
                    className="bg-white/[0.05] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-amber-500/60"
                  />
                  <input
                    placeholder="Số PO bán"
                    value={item.poSaleNumber}
                    onChange={(e) => updateItem(i, { poSaleNumber: e.target.value })}
                    className="bg-white/[0.05] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-amber-500/60"
                  />
                  <input
                    placeholder="ĐVT"
                    value={item.unit}
                    onChange={(e) => updateItem(i, { unit: e.target.value })}
                    className="bg-white/[0.05] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-amber-500/60"
                  />
                  <input
                    placeholder="Mã KH/PO-KH"
                    value={item.poCustomerItemCode}
                    onChange={(e) => updateItem(i, { poCustomerItemCode: e.target.value })}
                    className="bg-white/[0.05] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-amber-500/60"
                  />
                  <input
                    placeholder="SL yêu cầu"
                    type="number"
                    value={item.qtyRequested}
                    onChange={(e) => updateItem(i, { qtyRequested: e.target.value })}
                    className="bg-white/[0.05] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-amber-500/60"
                  />
                  <input
                    placeholder="SL thực xuất"
                    type="number"
                    value={item.qtyActual}
                    onChange={(e) => updateItem(i, { qtyActual: e.target.value })}
                    className="bg-white/[0.05] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-mono font-semibold text-right focus:outline-none focus:border-amber-500/60"
                  />
                </div>
                <input
                  placeholder="Ghi chú dòng hàng..."
                  value={item.note}
                  onChange={(e) => updateItem(i, { note: e.target.value })}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-gray-400 focus:outline-none focus:border-amber-500/60"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setStep("upload")}
            className="rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] px-4 py-2 text-xs font-medium text-gray-400 hover:text-white transition-colors"
          >
            ← Chụp / Chọn file khác
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !slipNumber.trim()}
            className="rounded-xl bg-gradient-to-r from-brandRed-600 to-amber-600 hover:from-brandRed-500 hover:to-amber-500 px-6 py-2.5 text-xs font-semibold text-white shadow-[0_0_20px_rgba(225,29,72,0.3)] border border-brandRed-500/40 disabled:opacity-50 transition-all"
          >
            {loading ? "Đang lưu phiếu..." : "Xác Nhận & Lưu Phiếu Xuất Kho"}
          </button>
        </div>
      </div>

      <div className="lg:sticky lg:top-6 self-start">
        <div className="glass-card border border-white/10 rounded-2xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
          <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
            <span className="text-xs uppercase font-semibold text-gray-400">Hình ảnh chứng từ gốc</span>
            <span className="text-[10px] text-amber-400 font-mono">Đối chiếu AI</span>
          </div>
          {imageThumbPath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageThumbPath} alt="Phiếu đi hàng" className="w-full rounded-xl object-contain max-h-[550px]" />
          )}
          {!imageThumbPath && imagePath?.toLowerCase().endsWith(".txt") && (
            <p className="text-xs text-gray-500 text-center py-10 italic">Phiếu dạng text — không có ảnh xem trước</p>
          )}
          {imagePath && (
            <a
              href={imagePath}
              target="_blank"
              rel="noreferrer"
              className="inline-block w-full text-center text-xs font-semibold text-amber-400 hover:text-amber-300 mt-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors"
            >
              {imagePath.toLowerCase().endsWith(".pdf")
                ? "📄 Xem file PDF gốc"
                : imagePath.toLowerCase().endsWith(".txt")
                ? "📄 Xem file text gốc"
                : "🔍 Mở ảnh gốc kích thước đầy đủ"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, low, children }: { label: string; low?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={cn("block text-xs font-semibold mb-1 uppercase tracking-wider", low ? "text-amber-400" : "text-gray-300")}>
        {label} {low && "⚠️"}
      </label>
      <div className={cn(low && "rounded-xl ring-2 ring-amber-500/60")}>{children}</div>
    </div>
  );
}
