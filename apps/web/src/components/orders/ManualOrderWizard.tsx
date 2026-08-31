"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Upload, Trash2, Plus, AlertTriangle } from "lucide-react";
import { formatCurrencyVND } from "@/lib/utils";

interface ParsedItem {
  itemCode: string | null;
  itemName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  note: string | null;
}
interface ParsedOrder {
  orderCode: string;
  customerName: string;
  orderDate: string | null;
  expectedDeliveryDate: string | null;
  totalValue: number;
  items: ParsedItem[];
  extra: Record<string, string>;
}
interface EmployeeOption {
  id: string;
  name: string;
  active: boolean;
  amisEmployeeCode: string | null;
}

const EXTRA_LABELS: Record<string, string> = {
  customerAddress: "Địa chỉ khách hàng",
  taxCode: "Mã số thuế",
  buyerName: "Người mua hàng",
  orderNote: "Ghi chú đơn hàng",
  receiverName: "Người nhận hàng",
  deliveryAddress: "Địa chỉ giao hàng",
  deliveryTime: "Thời gian giao hàng",
  deliveryTerms: "Điều kiện giao hàng",
  paymentTerms: "Điều kiện thanh toán",
  shippingCost: "Chi phí vận chuyển",
};

/** Yyyy-mm-dd cho <input type="date"> — API trả về ISO string đầy đủ. */
function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function ManualOrderWizard({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [duplicateOrderId, setDuplicateOrderId] = useState<string | null>(null);

  const [orderCode, setOrderCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [employeeId, setEmployeeId] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasParsed = items.length > 0 || orderCode || customerName;

  const { data: employeesData } = useQuery({
    queryKey: ["admin-users-for-manual-order"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Không tải được danh sách nhân viên");
      return res.json() as Promise<{ users: EmployeeOption[] }>;
    },
    enabled: isAdmin,
  });
  const employeeOptions = (employeesData?.users ?? []).filter((u) => u.active && u.amisEmployeeCode);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPreviewLoading(true);
    setPreviewError(null);
    setSaveError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/orders/manual/preview", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Không đọc được file");

      const parsed: ParsedOrder = json.parsed;
      setOrderCode(parsed.orderCode);
      setCustomerName(parsed.customerName);
      setOrderDate(toDateInputValue(parsed.orderDate));
      setExpectedDeliveryDate(toDateInputValue(parsed.expectedDeliveryDate));
      setItems(parsed.items);
      setExtra(parsed.extra ?? {});
      setDuplicateOrderId(json.duplicateOrderId ?? null);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Không đọc được file");
    } finally {
      setPreviewLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function updateItem(index: number, patch: Partial<ParsedItem>) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const next = { ...it, ...patch };
        // Sửa Số lượng/Đơn giá thì tự tính lại Thành tiền cho khớp — tránh lệch số khi sửa tay.
        if (patch.quantity !== undefined || patch.unitPrice !== undefined) {
          next.totalPrice = Math.round(next.quantity * next.unitPrice * 100) / 100;
        }
        return next;
      })
    );
  }
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }
  function addItem() {
    setItems((prev) => [...prev, { itemCode: "", itemName: "", unit: "", quantity: 0, unitPrice: 0, totalPrice: 0, note: null }]);
  }

  const totalValue = items.reduce((sum, it) => sum + it.totalPrice, 0);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/orders/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderCode,
          customerName,
          orderDate: orderDate || null,
          expectedDeliveryDate: expectedDeliveryDate || null,
          items: items.map((it) => ({
            itemCode: it.itemCode || null,
            itemName: it.itemName,
            unit: it.unit || null,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
          })),
          extra,
          employeeId: isAdmin ? employeeId : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Không tạo được đơn hàng");
      router.push(`/orders/${json.order.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Không tạo được đơn hàng");
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    !saving &&
    !duplicateOrderId &&
    orderCode.trim() &&
    customerName.trim() &&
    items.length > 0 &&
    items.every((it) => it.itemName.trim()) &&
    (!isAdmin || employeeId);

  return (
    <div className="space-y-6">
      {!hasParsed && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-card p-10 text-center">
          <Upload className="mx-auto h-8 w-8 text-muted2" />
          <p className="mt-2 text-sm text-muted-foreground">
            Chọn file Excel &quot;Đơn đặt hàng&quot; (1 file = 1 đơn) để đọc thử — anh sẽ xem/sửa lại trước khi lưu.
          </p>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-brandRed-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brandRed-700">
            <Upload className="h-4 w-4" />
            {previewLoading ? "Đang đọc file..." : "Chọn file Excel"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={previewLoading}
              onChange={handleFileChange}
            />
          </label>
          {previewError && <p className="mt-3 text-sm text-brandRed-600">{previewError}</p>}
        </div>
      )}

      {hasParsed && (
        <div className="space-y-6">
          {fileName && <p className="text-xs text-muted-foreground">File: {fileName}</p>}

          {duplicateOrderId && (
            <div className="flex items-start gap-2 rounded-md bg-warning-500/10 px-4 py-3 text-sm text-warning-500">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Đơn hàng <strong>{orderCode}</strong> đã tồn tại trong hệ thống — không thể tạo trùng.{" "}
                <a href={`/orders/${duplicateOrderId}`} className="underline">
                  Vào sửa đơn đã có
                </a>{" "}
                thay vì tạo mới.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-card p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Số PO / Mã đơn hàng
              <input value={orderCode} onChange={(e) => setOrderCode(e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Tên khách hàng
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Ngày đặt hàng
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="input" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Ngày giao hàng dự kiến
              <input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="input"
              />
            </label>
            {isAdmin && (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                Nhân viên phụ trách
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="input">
                  <option value="">— Chọn nhân viên —</option>
                  {employeeOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Mã hàng ({items.length} dòng)</p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-card">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Mã hàng</th>
                    <th className="text-left font-medium px-3 py-2">Tên hàng</th>
                    <th className="text-left font-medium px-3 py-2">Đvt</th>
                    <th className="text-right font-medium px-3 py-2">Số lượng</th>
                    <th className="text-right font-medium px-3 py-2">Đơn giá</th>
                    <th className="text-right font-medium px-3 py-2">Thành tiền</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">
                        <input
                          value={it.itemCode ?? ""}
                          onChange={(e) => updateItem(i, { itemCode: e.target.value })}
                          className="input w-28"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={it.itemName}
                          onChange={(e) => updateItem(i, { itemName: e.target.value })}
                          className="input w-56"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={it.unit ?? ""}
                          onChange={(e) => updateItem(i, { unit: e.target.value })}
                          className="input w-16"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={it.quantity}
                          onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                          className="input w-24 text-right"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={it.unitPrice}
                          onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                          className="input w-24 text-right"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={it.totalPrice}
                          onChange={(e) => updateItem(i, { totalPrice: Number(e.target.value) })}
                          className="input w-28 text-right"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button onClick={() => removeItem(i)} className="text-muted2 hover:text-brandRed-600" title="Xoá dòng">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 font-semibold text-ink">
                    <td colSpan={5} className="px-3 py-2 text-right">
                      Tổng cộng
                    </td>
                    <td className="px-3 py-2 text-right">{formatCurrencyVND(totalValue)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <button onClick={addItem} className="flex items-center gap-1.5 text-xs font-medium text-amber-500 hover:underline">
              <Plus className="h-3.5 w-3.5" /> Thêm dòng mã hàng
            </button>
          </div>

          {Object.keys(extra).length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-ink mb-2">Thông tin khác đọc được từ file (chỉ để tham khảo)</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                {Object.entries(extra).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">{EXTRA_LABELS[key] ?? key}:</dt>
                    <dd className="text-ink2">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {saveError && <div className="rounded-md bg-brandRed-50 text-brandRed-600 text-sm px-4 py-2.5">{saveError}</div>}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-md bg-brandRed-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brandRed-700 disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Lưu đơn hàng"}
            </button>
            <button
              onClick={() => {
                setOrderCode("");
                setCustomerName("");
                setOrderDate("");
                setExpectedDeliveryDate("");
                setItems([]);
                setExtra({});
                setFileName(null);
                setDuplicateOrderId(null);
                setSaveError(null);
              }}
              className="text-sm text-muted-foreground hover:text-ink"
            >
              Chọn file khác
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
