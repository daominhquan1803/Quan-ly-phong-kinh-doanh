"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, ArrowLeft, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatDateVN } from "@/lib/utils";

interface CustomerOption {
  customerCode: string;
  customerName: string;
}
interface AvailableLine {
  poTrackingLineId: string;
  salesEmployeeId: string | null;
  salesEmployeeName: string;
  poCode: string;
  itemCode: string | null;
  itemName: string;
  customerItemCode: string | null;
  unit: string | null;
  poQuantity: number | null;
  remainingQty: number | null;
  poDate: string | null;
  requestedDeliveryDate: string | null;
}
interface Employee {
  id: string;
  name: string;
}

function toISODateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

const DEFAULT_NOTE =
  "- Khi soạn hàng lưu ý đúng mã, đúng nội dung tem nhãn.\n- Đóng gói theo quy cách của khách hàng.\n- Chuẩn bị đầy đủ giấy tờ đi kèm.";

export function PickingSlipWizard() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);

  const { data: customerData, isFetching: searchingCustomers } = useQuery({
    queryKey: ["picking-customers", customerQuery],
    queryFn: async () => {
      const res = await fetch(`/api/picking-slips/customers?q=${encodeURIComponent(customerQuery)}`);
      if (!res.ok) throw new Error("Không tìm được khách hàng");
      return res.json() as Promise<{ customers: CustomerOption[] }>;
    },
    enabled: step === 1,
  });

  const { data: linesData, isLoading: loadingLines } = useQuery({
    queryKey: ["picking-available-lines", selectedCustomer?.customerCode],
    queryFn: async () => {
      const res = await fetch(`/api/picking-slips/available-lines?customerCode=${encodeURIComponent(selectedCustomer!.customerCode)}`);
      if (!res.ok) throw new Error("Không tải được danh sách PO chưa giao");
      return res.json() as Promise<{ lines: AvailableLine[] }>;
    },
    enabled: step === 2 && !!selectedCustomer,
  });

  const { data: employeesData } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Không tải được danh sách nhân viên");
      return res.json() as Promise<{ users: Employee[] }>;
    },
  });

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [qtyEdits, setQtyEdits] = useState<Record<string, string>>({});
  const [deliveryDateEdits, setDeliveryDateEdits] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState({ poCode: "", itemCode: "", itemName: "", customerItemCode: "" });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [salesEmployeeId, setSalesEmployeeId] = useState("");
  const [note, setNote] = useState(DEFAULT_NOTE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Khi có dữ liệu dòng PO, tự chọn NVKD phụ trách theo người xuất hiện nhiều nhất trong các
  // dòng của khách hàng này — admin vẫn sửa lại được nếu cần.
  useEffect(() => {
    if (!linesData?.lines.length || salesEmployeeId) return;
    const counts = new Map<string, number>();
    for (const l of linesData.lines) {
      if (!l.salesEmployeeId) continue;
      counts.set(l.salesEmployeeId, (counts.get(l.salesEmployeeId) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [id, c] of counts) {
      if (c > bestCount) {
        best = id;
        bestCount = c;
      }
    }
    if (best) setSalesEmployeeId(best);
  }, [linesData, salesEmployeeId]);

  // Về lại trang 1 mỗi khi đổi bộ lọc hoặc đổi khách hàng — tránh đứng ở 1 trang trống sau khi
  // lọc còn ít dòng hơn.
  useEffect(() => {
    setPage(1);
  }, [filters, selectedCustomer?.customerCode]);

  function toggleCheck(id: string, line: AvailableLine) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (qtyEdits[id] === undefined) {
          setQtyEdits((p) => ({ ...p, [id]: String(line.remainingQty ?? 0) }));
        }
        if (deliveryDateEdits[id] === undefined) {
          setDeliveryDateEdits((p) => ({ ...p, [id]: toISODateInput(line.requestedDeliveryDate) }));
        }
      }
      return next;
    });
  }

  const selectedCount = checked.size;

  async function handleCreate() {
    setError(null);
    if (!selectedCustomer) return;
    if (checked.size === 0) {
      setError("Chưa tích chọn dòng hàng nào");
      return;
    }
    const lines = linesData?.lines ?? [];
    const items = Array.from(checked).map((id) => {
      const line = lines.find((l) => l.poTrackingLineId === id)!;
      return {
        poTrackingLineId: line.poTrackingLineId,
        poCode: line.poCode,
        itemCode: line.itemCode,
        itemName: line.itemName,
        customerItemCode: line.customerItemCode,
        unit: line.unit,
        poQuantitySnapshot: line.poQuantity,
        remainingQtySnapshot: line.remainingQty,
        poDateSnapshot: line.poDate,
        qtyToPick: Number(qtyEdits[id] ?? line.remainingQty ?? 0),
        deliveryDate: deliveryDateEdits[id] || null,
      };
    });
    if (items.some((it) => !(it.qtyToPick > 0))) {
      setError("Số lượng cần soạn phải lớn hơn 0 cho mọi dòng đã chọn");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/picking-slips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerCode: selectedCustomer.customerCode,
        customerName: selectedCustomer.customerName,
        deliveryAddress: deliveryAddress || null,
        contactPhone: contactPhone || null,
        salesEmployeeId: salesEmployeeId || null,
        note: note || null,
        items,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "Không tạo được phiếu");
      return;
    }
    router.push(`/picking-slips/${json.slip.id}`);
  }

  const lines = linesData?.lines ?? [];
  const filteredLines = lines.filter((l) => {
    const f = filters;
    if (f.poCode && !l.poCode.toLowerCase().includes(f.poCode.toLowerCase())) return false;
    if (f.itemCode && !(l.itemCode ?? "").toLowerCase().includes(f.itemCode.toLowerCase())) return false;
    if (f.itemName && !l.itemName.toLowerCase().includes(f.itemName.toLowerCase())) return false;
    if (f.customerItemCode && !(l.customerItemCode ?? "").toLowerCase().includes(f.customerItemCode.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredLines.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedLines = filteredLines.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Độ rộng cố định (px) cho 3 cột luôn hiện khi kéo ngang: ô tích chọn, Số PO, Mã hàng — để vừa
  // nhìn thấy vừa tích chọn được trong lúc điền SL cần soạn/Ngày cần giao ở cột xa bên phải.
  const STICKY_W = { check: 36, poCode: 130, itemCode: 110 };
  const stickyStyle = (col: "check" | "poCode" | "itemCode"): CSSProperties => {
    const left = col === "check" ? 0 : col === "poCode" ? STICKY_W.check : STICKY_W.check + STICKY_W.poCode;
    const width = STICKY_W[col];
    return { position: "sticky", left, width, minWidth: width, maxWidth: width };
  };
  // Bề rộng CỐ ĐỊNH cho MỌI cột qua <colgroup> + table-layout: fixed — tránh lỗi trình duyệt co
  // hẹp cột "Tên SP"/"Mã Hàng/Số PO-KH" gần như mất chữ khi kết hợp với các cột sticky bên trái
  // (đã xảy ra thật khi test — table-layout mặc định "auto" tính sai độ rộng còn lại khi có
  // cột sticky ở đầu bảng).
  const COL_WIDTHS = [36, 130, 110, 260, 170, 60, 90, 100, 100, 100, 100, 120];
  const TABLE_WIDTH = COL_WIDTHS.reduce((s, w) => s + w, 0);

  if (step === 1) {
    return (
      <div className="rounded-lg border border-gray-200 bg-card p-5">
        <h2 className="font-medium text-ink mb-3">Bước 1 — Chọn khách hàng</h2>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted2" />
          <input
            autoFocus
            placeholder="Gõ tên hoặc mã khách hàng..."
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
            className="w-full max-w-md pl-9 input"
          />
        </div>
        <div className="divide-y divide-gray-100 max-w-md">
          {searchingCustomers && <p className="text-sm text-muted-foreground py-3">Đang tìm...</p>}
          {!searchingCustomers && (customerData?.customers.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground py-3">
              Không tìm thấy khách hàng nào còn PO chưa giao khớp từ khoá này.
            </p>
          )}
          {customerData?.customers.map((c) => (
            <button
              key={c.customerCode}
              onClick={() => {
                setSelectedCustomer(c);
                setChecked(new Set());
                setQtyEdits({});
                setDeliveryDateEdits({});
                setSalesEmployeeId("");
                setStep(2);
              }}
              className="w-full text-left py-2.5 hover:bg-gray-50 rounded-md px-2 -mx-2"
            >
              <p className="text-sm font-medium text-ink">{c.customerName}</p>
              <p className="text-xs text-muted-foreground">{c.customerCode}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => setStep(1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Đổi khách hàng
      </button>

      <div className="rounded-lg border border-gray-200 bg-card p-5">
        <h2 className="font-medium text-ink mb-1">{selectedCustomer?.customerName}</h2>
        <p className="text-xs text-muted-foreground mb-4">{selectedCustomer?.customerCode}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Địa chỉ giao hàng
            <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} className="input" />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            SĐT liên hệ
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="input" />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Phụ trách đơn hàng
            <select value={salesEmployeeId} onChange={(e) => setSalesEmployeeId(e.target.value)} className="input">
              <option value="">— Chọn —</option>
              {employeesData?.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h3 className="font-medium text-ink mb-2">Bước 2 — Chọn mã hàng cần soạn</h3>
        {loadingLines ? (
          <p className="text-sm text-muted-foreground py-4">Đang tải danh sách PO chưa giao...</p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Khách hàng này hiện không còn PO nào chưa giao.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="text-sm" style={{ tableLayout: "fixed", width: TABLE_WIDTH, minWidth: "100%" }}>
              <colgroup>
                {COL_WIDTHS.map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="font-medium px-2 py-1.5 bg-card z-20" style={stickyStyle("check")}></th>
                  <th className="font-medium px-2 py-1.5 bg-card z-20" style={stickyStyle("poCode")}>
                    <div className="flex flex-col gap-1">
                      <span>Số PO</span>
                      <input
                        value={filters.poCode}
                        onChange={(e) => setFilters((f) => ({ ...f, poCode: e.target.value }))}
                        placeholder="Tìm..."
                        className="w-full text-xs font-normal bg-card text-ink rounded border border-gray-200 py-0.5 px-1"
                      />
                    </div>
                  </th>
                  <th
                    className="font-medium px-2 py-1.5 bg-card z-20 border-r border-gray-200"
                    style={stickyStyle("itemCode")}
                  >
                    <div className="flex flex-col gap-1">
                      <span>Mã hàng</span>
                      <input
                        value={filters.itemCode}
                        onChange={(e) => setFilters((f) => ({ ...f, itemCode: e.target.value }))}
                        placeholder="Tìm..."
                        className="w-full text-xs font-normal bg-card text-ink rounded border border-gray-200 py-0.5 px-1"
                      />
                    </div>
                  </th>
                  <th className="font-medium px-2 py-1.5 min-w-[220px]">
                    <div className="flex flex-col gap-1">
                      <span>Tên SP</span>
                      <input
                        value={filters.itemName}
                        onChange={(e) => setFilters((f) => ({ ...f, itemName: e.target.value }))}
                        placeholder="Tìm..."
                        className="w-full text-xs font-normal bg-card text-ink rounded border border-gray-200 py-0.5 px-1"
                      />
                    </div>
                  </th>
                  <th className="font-medium px-2 py-1.5 min-w-[160px]">
                    <div className="flex flex-col gap-1">
                      <span>Mã Hàng/Số PO-KH</span>
                      <input
                        value={filters.customerItemCode}
                        onChange={(e) => setFilters((f) => ({ ...f, customerItemCode: e.target.value }))}
                        placeholder="Tìm..."
                        className="w-full text-xs font-normal bg-card text-ink rounded border border-gray-200 py-0.5 px-1"
                      />
                    </div>
                  </th>
                  <th className="font-medium px-2 py-1.5">ĐVT</th>
                  <th className="font-medium px-2 py-1.5 text-right">SL PO</th>
                  <th className="font-medium px-2 py-1.5 text-right">SL chưa giao</th>
                  <th className="font-medium px-2 py-1.5">Ngày PO</th>
                  <th className="font-medium px-2 py-1.5">Ngày Y/C giao</th>
                  <th className="font-medium px-2 py-1.5 text-right">SL cần soạn</th>
                  <th className="font-medium px-2 py-1.5">Ngày cần giao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedLines.map((l) => {
                  const isChecked = checked.has(l.poTrackingLineId);
                  return (
                    <tr key={l.poTrackingLineId} className={cn(isChecked && "bg-amber-500/5")}>
                      <td className="px-2 py-1.5 bg-card z-10" style={stickyStyle("check")}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(l.poTrackingLineId, l)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-ink2 whitespace-nowrap bg-card z-10" style={stickyStyle("poCode")}>
                        {l.poCode}
                      </td>
                      <td
                        className="px-2 py-1.5 text-ink whitespace-nowrap bg-card z-10 border-r border-gray-200"
                        style={stickyStyle("itemCode")}
                      >
                        {l.itemCode ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-ink2 max-w-[240px] truncate" title={l.itemName}>
                        {l.itemName}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{l.customerItemCode ?? "—"}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{l.unit ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{l.poQuantity ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-amber-500">{l.remainingQty ?? "—"}</td>
                      <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{formatDateVN(l.poDate)}</td>
                      <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{formatDateVN(l.requestedDeliveryDate)}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          disabled={!isChecked}
                          value={qtyEdits[l.poTrackingLineId] ?? ""}
                          onChange={(e) => setQtyEdits((p) => ({ ...p, [l.poTrackingLineId]: e.target.value }))}
                          className="w-20 text-right text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-1.5 disabled:opacity-40"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="date"
                          disabled={!isChecked}
                          value={deliveryDateEdits[l.poTrackingLineId] ?? ""}
                          onChange={(e) => setDeliveryDateEdits((p) => ({ ...p, [l.poTrackingLineId]: e.target.value }))}
                          className="text-sm bg-card text-ink rounded-md border border-gray-200 py-1 px-1.5 disabled:opacity-40"
                        />
                      </td>
                    </tr>
                  );
                })}
                {filteredLines.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-2 py-4 text-center text-muted-foreground">
                      Không có dòng nào khớp bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {filteredLines.length > 0 && (
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>
              Tổng {filteredLines.length} dòng — trang {currentPage}/{totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Trước
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 disabled:opacity-40 hover:bg-gray-50"
              >
                Sau <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <label className="text-xs text-muted-foreground flex flex-col gap-1 mt-4">
          Lưu ý (in trên phiếu)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="input" />
        </label>

        {error && <p className="text-sm text-brandRed-600 mt-3">{error}</p>}

        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">Đã chọn {selectedCount} dòng hàng</p>
          <button
            onClick={handleCreate}
            disabled={saving || selectedCount === 0}
            className="flex items-center gap-1.5 rounded-md bg-brandRed-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brandRed-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Đang tạo..." : "Tạo phiếu soạn hàng"}
          </button>
        </div>
      </div>
    </div>
  );
}

