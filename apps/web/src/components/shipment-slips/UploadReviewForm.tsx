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
      if (!res.ok) throw new Error(json.error ?? "Không xử lý được ảnh");

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
      <div className="space-y-4">
        {error && <div className="rounded-md bg-brandRed-50 text-brandRed-600 text-sm px-4 py-2.5">{error}</div>}
        <label className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-200 bg-white py-16 cursor-pointer hover:border-navy-900 transition-colors">
          <UploadCloud className="h-10 w-10 text-navy-900" />
          <div className="text-center">
            <p className="font-medium text-gray-900">Chụp hoặc chọn ảnh phiếu đi hàng</p>
            <p className="text-sm text-gray-500">AI sẽ tự đọc và điền sẵn form để anh kiểm tra lại</p>
          </div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelected(f);
            }}
          />
          {loading && <p className="text-sm text-gray-500">AI đang đọc ảnh, vui lòng đợi...</p>}
        </label>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        {error && <div className="rounded-md bg-brandRed-50 text-brandRed-600 text-sm px-4 py-2.5">{error}</div>}
        {lowConfidence.length > 0 && (
          <div className="flex items-center gap-2 rounded-md bg-warning-500/10 text-warning-500 text-sm px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            AI không chắc chắn ở một số trường (viền vàng) — vui lòng đối chiếu ảnh gốc bên phải.
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Số phiếu" low={isLow("slipNumber")}>
              <input value={slipNumber} onChange={(e) => setSlipNumber(e.target.value)} className="input" />
            </Field>
            <Field label="Ngày lập phiếu" low={isLow("slipDate")}>
              <input type="date" value={slipDate} onChange={(e) => setSlipDate(e.target.value)} className="input" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Người nhận hàng" low={isLow("receiverName")}>
              <input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} className="input" />
            </Field>
            <Field label="Khách hàng" low={isLow("customerName")}>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input" />
            </Field>
          </div>
          <Field label="Địa chỉ giao hàng" low={isLow("deliveryAddress")}>
            <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} className="input" />
          </Field>
          <Field label="Diễn giải" low={isLow("description")}>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hình thức thanh toán" low={isLow("paymentMethod")}>
              <input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input" />
            </Field>
            <Field label="Người lập phiếu" low={isLow("preparedBy")}>
              <input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} className="input" />
            </Field>
          </div>
          <Field label="Liên kết đơn hàng (tuỳ chọn)">
            <OrderPicker value={orderId} onChange={setOrderId} initialQuery={customerName} />
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900">Chi tiết hàng hoá</h3>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
              className="flex items-center gap-1 text-sm text-navy-900 hover:underline"
            >
              <Plus className="h-4 w-4" /> Thêm dòng
            </button>
          </div>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="rounded-md border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">Dòng {i + 1}</span>
                  {items.length > 1 && (
                    <button type="button" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4 text-brandRed-600" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Mã hàng"
                    value={item.itemCode}
                    onChange={(e) => updateItem(i, { itemCode: e.target.value })}
                    className="input"
                  />
                  <input
                    placeholder="Tên hàng *"
                    value={item.itemName}
                    onChange={(e) => updateItem(i, { itemName: e.target.value })}
                    className="input"
                  />
                  <input
                    placeholder="Kho"
                    value={item.warehouse}
                    onChange={(e) => updateItem(i, { warehouse: e.target.value })}
                    className="input"
                  />
                  <input
                    placeholder="Số PO bán"
                    value={item.poSaleNumber}
                    onChange={(e) => updateItem(i, { poSaleNumber: e.target.value })}
                    className="input"
                  />
                  <input
                    placeholder="ĐVT"
                    value={item.unit}
                    onChange={(e) => updateItem(i, { unit: e.target.value })}
                    className="input"
                  />
                  <input
                    placeholder="Số PO/Mã hàng KH"
                    value={item.poCustomerItemCode}
                    onChange={(e) => updateItem(i, { poCustomerItemCode: e.target.value })}
                    className="input"
                  />
                  <input
                    placeholder="SL yêu cầu"
                    type="number"
                    value={item.qtyRequested}
                    onChange={(e) => updateItem(i, { qtyRequested: e.target.value })}
                    className="input"
                  />
                  <input
                    placeholder="SL thực xuất"
                    type="number"
                    value={item.qtyActual}
                    onChange={(e) => updateItem(i, { qtyActual: e.target.value })}
                    className="input"
                  />
                </div>
                <input
                  placeholder="Ghi chú"
                  value={item.note}
                  onChange={(e) => updateItem(i, { note: e.target.value })}
                  className="input w-full"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep("upload")}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Chụp ảnh khác
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !slipNumber.trim()}
            className="rounded-md bg-brandRed-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brandRed-700 disabled:opacity-50"
          >
            {loading ? "Đang lưu..." : "Xác nhận & Lưu phiếu"}
          </button>
        </div>
      </div>

      <div className="lg:sticky lg:top-6 self-start">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          {imageThumbPath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageThumbPath} alt="Phiếu đi hàng" className="w-full rounded-md" />
          )}
          {imagePath && (
            <a href={imagePath} target="_blank" rel="noreferrer" className="block text-center text-xs text-navy-900 mt-2 hover:underline">
              Xem ảnh gốc kích thước đầy đủ
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
      <label className={cn("block text-sm mb-1", low ? "text-warning-500 font-medium" : "text-gray-700")}>
        {label} {low && "⚠"}
      </label>
      <div className={cn(low && "rounded-md ring-2 ring-warning-500")}>{children}</div>
    </div>
  );
}
