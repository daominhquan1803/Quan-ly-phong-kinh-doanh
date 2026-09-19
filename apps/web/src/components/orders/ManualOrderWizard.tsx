"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Upload, Trash2, Plus, AlertTriangle } from "lucide-react";
import { formatCurrencyVND, toDateInputValueVN } from "@/lib/utils";

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
      setOrderDate(toDateInputValueVN(parsed.orderDate));
      setExpectedDeliveryDate(toDateInputValueVN(parsed.expectedDeliveryDate));
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
        <div className="rounded-3xl border-2 border-dashed border-white/20 bg-white/[0.02] hover:bg-white/[0.05] hover:border-amber-400/50 p-12 text-center transition-all shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)] mb-4">
            <Upload className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold text-white">
            Chọn file Excel &quot;Đơn đặt hàng&quot; (1 file = 1 đơn)
          </p>
          <p className="mt-1 text-xs text-gray-400 max-w-md mx-auto">
            Hệ thống sẽ tự động đọc mã PO, khách hàng và danh sách sản phẩm. Bạn hoàn toàn có thể kiểm tra và chỉnh sửa lại trước khi lưu.
          </p>
          <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-brandRed-600 to-amber-600 hover:from-brandRed-500 hover:to-amber-500 px-5 py-2.5 text-xs font-semibold text-white shadow-[0_0_20px_rgba(225,29,72,0.3)] border border-brandRed-500/40 transition-all active:scale-[0.98]">
            <Upload className="h-4 w-4" />
            {previewLoading ? "Đang đọc dữ liệu file..." : "Chọn file Excel từ máy tính"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={previewLoading}
              onChange={handleFileChange}
            />
          </label>
          {previewError && (
            <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 max-w-md mx-auto">
              {previewError}
            </div>
          )}
        </div>
      )}

      {hasParsed && (
        <div className="space-y-6">
          {fileName && (
            <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
              <span className="text-amber-400">📄 File đang đọc:</span> {fileName}
            </div>
          )}

          {duplicateOrderId && (
            <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Đơn hàng <strong className="font-mono text-white">{orderCode}</strong> đã tồn tại trong hệ thống — không thể tạo trùng.{" "}
                <a href={`/orders/${duplicateOrderId}`} className="underline text-amber-400 font-semibold hover:text-amber-300">
                  Vào xem hoặc sửa đơn đã có
                </a>{" "}
                thay vì tạo mới.
              </div>
            </div>
          )}

          <div className="glass-card border border-white/10 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2">
              Thông Tin Cơ Bản Đơn Hàng
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-xs text-gray-300">
                Số PO / Mã đơn hàng *
                <input
                  value={orderCode}
                  onChange={(e) => setOrderCode(e.target.value)}
                  className="bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500/60"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-300">
                Tên khách hàng *
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/60"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-300">
                Ngày đặt hàng
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/60"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-300">
                Ngày giao hàng dự kiến
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  className="bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/60"
                />
              </label>
              {isAdmin && (
                <label className="flex flex-col gap-1 text-xs text-gray-300 sm:col-span-2">
                  Nhân viên kinh doanh phụ trách *
                  <select
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="bg-[#18181b] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/60"
                  >
                    <option value="">— Chọn nhân viên phụ trách —</option>
                    {employeeOptions.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>

          <div className="glass-card border border-white/10 rounded-2xl p-6 space-y-3 shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                Chi Tiết Mặt Hàng ({items.length} dòng)
              </h3>
              <button
                onClick={addItem}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Thêm dòng
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-white/[0.03] border-b border-white/10 text-gray-400 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="text-left py-2.5 px-2.5">Mã hàng</th>
                    <th className="text-left py-2.5 px-2.5">Tên hàng *</th>
                    <th className="text-left py-2.5 px-2.5">ĐVT</th>
                    <th className="text-right py-2.5 px-2.5">Số lượng</th>
                    <th className="text-right py-2.5 px-2.5">Đơn giá</th>
                    <th className="text-right py-2.5 px-2.5">Thành tiền</th>
                    <th className="py-2.5 px-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {items.map((it, i) => (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="py-2 px-2.5">
                        <input
                          value={it.itemCode ?? ""}
                          onChange={(e) => updateItem(i, { itemCode: e.target.value })}
                          className="w-24 bg-white/[0.05] border border-white/15 rounded-lg px-2 py-1 text-xs text-amber-400 font-mono focus:outline-none focus:border-amber-500/60"
                          placeholder="Mã"
                        />
                      </td>
                      <td className="py-2 px-2.5">
                        <input
                          value={it.itemName}
                          onChange={(e) => updateItem(i, { itemName: e.target.value })}
                          className="w-48 sm:w-60 bg-white/[0.05] border border-white/15 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500/60"
                          placeholder="Tên hàng hóa"
                        />
                      </td>
                      <td className="py-2 px-2.5">
                        <input
                          value={it.unit ?? ""}
                          onChange={(e) => updateItem(i, { unit: e.target.value })}
                          className="w-16 bg-white/[0.05] border border-white/15 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-amber-500/60"
                          placeholder="Cái"
                        />
                      </td>
                      <td className="py-2 px-2.5">
                        <input
                          type="number"
                          value={it.quantity}
                          onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                          className="w-24 bg-white/[0.05] border border-white/15 rounded-lg px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:border-amber-500/60"
                        />
                      </td>
                      <td className="py-2 px-2.5">
                        <input
                          type="number"
                          value={it.unitPrice}
                          onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                          className="w-24 bg-white/[0.05] border border-white/15 rounded-lg px-2 py-1 text-xs text-gray-300 font-mono text-right focus:outline-none focus:border-amber-500/60"
                        />
                      </td>
                      <td className="py-2 px-2.5">
                        <input
                          type="number"
                          value={it.totalPrice}
                          onChange={(e) => updateItem(i, { totalPrice: Number(e.target.value) })}
                          className="w-28 bg-white/[0.05] border border-white/15 rounded-lg px-2 py-1 text-xs text-emerald-400 font-mono font-semibold text-right focus:outline-none focus:border-amber-500/60"
                        />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <button
                          onClick={() => removeItem(i)}
                          className="p-1 rounded text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Xoá dòng"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10 font-semibold text-white bg-white/[0.02]">
                    <td colSpan={5} className="py-3 px-3 text-right uppercase text-gray-400 text-xs">
                      Tổng giá trị đơn hàng
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-400 text-sm">
                      {formatCurrencyVND(totalValue)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {Object.keys(extra).length > 0 && (
            <div className="glass-card border border-white/10 rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
              <p className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-2">
                Thông tin bổ trợ trích xuất từ file (tham khảo):
              </p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                {Object.entries(extra).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2">
                    <dt className="shrink-0 text-gray-400">{EXTRA_LABELS[key] ?? key}:</dt>
                    <dd className="text-gray-200 font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {saveError && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs px-4 py-3">
              {saveError}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-xl bg-gradient-to-r from-brandRed-600 to-amber-600 hover:from-brandRed-500 hover:to-amber-500 px-6 py-2.5 text-xs font-semibold text-white shadow-[0_0_20px_rgba(225,29,72,0.3)] border border-brandRed-500/40 disabled:opacity-50 transition-all"
            >
              {saving ? "Đang lưu đơn hàng..." : "Hoàn Tất & Lưu Đơn Hàng"}
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
              className="rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] px-4 py-2 text-xs font-medium text-gray-400 hover:text-white transition-colors"
            >
              Chọn file khác
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
