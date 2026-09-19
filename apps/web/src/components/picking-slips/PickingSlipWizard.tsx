"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, ArrowLeft, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatDateVN, toDateInputValueVN } from "@/lib/utils";

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
          setDeliveryDateEdits((p) => ({ ...p, [id]: toDateInputValueVN(line.requestedDeliveryDate) }));
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
      <div className="glass-card border border-white/10 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
        <div className="mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Bước 1</span>
          <h2 className="text-lg font-bold text-white tracking-wide mt-0.5">Chọn Khách Hàng Cần Soạn Hàng</h2>
          <p className="text-xs text-gray-400">Chỉ hiển thị các khách hàng có đơn hàng chưa hoàn thành giao</p>
        </div>

        <div className="relative mb-5 max-w-lg">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            autoFocus
            placeholder="Tìm theo tên hoặc mã khách hàng..."
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
            className="w-full pl-10 bg-white/[0.05] border border-white/15 rounded-xl py-2.5 px-4 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 transition-all"
          />
        </div>

        <div className="divide-y divide-white/5 max-w-lg space-y-1">
          {searchingCustomers && (
            <p className="text-xs text-amber-400 py-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
              Đang tìm kiếm khách hàng...
            </p>
          )}
          {!searchingCustomers && (customerData?.customers.length ?? 0) === 0 && (
            <p className="text-xs text-gray-400 py-4 italic">
              Không tìm thấy khách hàng nào còn PO chưa giao khớp với từ khoá này.
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
              className="w-full text-left p-3 hover:bg-white/[0.04] rounded-xl border border-transparent hover:border-white/10 transition-all group"
            >
              <p className="text-xs font-semibold text-white group-hover:text-amber-400 transition-colors">
                {c.customerName}
              </p>
              <p className="text-[11px] font-mono text-gray-400 mt-0.5">{c.customerCode}</p>
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
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-amber-400 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Chọn khách hàng khác
      </button>

      <div className="glass-card border border-white/10 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4 mb-5">
          <div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {selectedCustomer?.customerCode}
            </span>
            <h2 className="text-lg font-bold text-white tracking-wide mt-1">{selectedCustomer?.customerName}</h2>
          </div>
          <div className="text-xs text-gray-400">
            <span className="text-amber-400 font-semibold">Bước 2:</span> Chọn mã hàng & nhập số lượng soạn
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <label className="text-xs text-gray-300 flex flex-col gap-1.5">
            Địa chỉ giao hàng
            <input
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="VD: Kho KCN Quế Võ..."
              className="bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500/60"
            />
          </label>
          <label className="text-xs text-gray-300 flex flex-col gap-1.5">
            SĐT liên hệ
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="VD: 0988..."
              className="bg-white/[0.05] border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500/60"
            />
          </label>
          <label className="text-xs text-gray-300 flex flex-col gap-1.5">
            Phụ trách đơn hàng
            <select
              value={salesEmployeeId}
              onChange={(e) => setSalesEmployeeId(e.target.value)}
              className="bg-[#18181b] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/60"
            >
              <option value="">— Chọn NVKD phụ trách —</option>
              {employeesData?.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-gray-400">
            Danh Sách Mã Hàng Chưa Giao ({filteredLines.length} dòng)
          </h3>
          <span className="text-xs text-amber-400 font-medium">
            Đã tích chọn: <strong>{selectedCount}</strong> dòng
          </span>
        </div>

        {loadingLines ? (
          <p className="text-xs text-amber-400 py-6 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
            Đang tải dữ liệu đơn hàng chưa giao...
          </p>
        ) : lines.length === 0 ? (
          <p className="text-xs text-gray-500 py-6 italic">Khách hàng này hiện không còn PO nào chưa giao.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="text-xs" style={{ tableLayout: "fixed", width: TABLE_WIDTH, minWidth: "100%" }}>
              <colgroup>
                {COL_WIDTHS.map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-white/10">
                  <th className="font-semibold px-2 py-2 bg-[#10121b] z-20" style={stickyStyle("check")}></th>
                  <th className="font-semibold px-2 py-2 bg-[#10121b] z-20" style={stickyStyle("poCode")}>
                    <div className="flex flex-col gap-1">
                      <span>Số PO</span>
                      <input
                        value={filters.poCode}
                        onChange={(e) => setFilters((f) => ({ ...f, poCode: e.target.value }))}
                        placeholder="Lọc..."
                        className="w-full text-xs font-normal bg-white/[0.05] text-white rounded border border-white/15 py-0.5 px-1.5 focus:outline-none focus:border-amber-500/60"
                      />
                    </div>
                  </th>
                  <th
                    className="font-semibold px-2 py-2 bg-[#10121b] z-20 border-r border-white/10"
                    style={stickyStyle("itemCode")}
                  >
                    <div className="flex flex-col gap-1">
                      <span>Mã hàng</span>
                      <input
                        value={filters.itemCode}
                        onChange={(e) => setFilters((f) => ({ ...f, itemCode: e.target.value }))}
                        placeholder="Lọc..."
                        className="w-full text-xs font-normal bg-white/[0.05] text-white rounded border border-white/15 py-0.5 px-1.5 focus:outline-none focus:border-amber-500/60"
                      />
                    </div>
                  </th>
                  <th className="font-semibold px-2 py-2 min-w-[220px] bg-white/[0.02]">
                    <div className="flex flex-col gap-1">
                      <span>Tên Hàng Hóa</span>
                      <input
                        value={filters.itemName}
                        onChange={(e) => setFilters((f) => ({ ...f, itemName: e.target.value }))}
                        placeholder="Lọc..."
                        className="w-full text-xs font-normal bg-white/[0.05] text-white rounded border border-white/15 py-0.5 px-1.5 focus:outline-none focus:border-amber-500/60"
                      />
                    </div>
                  </th>
                  <th className="font-semibold px-2 py-2 min-w-[160px] bg-white/[0.02]">
                    <div className="flex flex-col gap-1">
                      <span>Mã KH/PO-KH</span>
                      <input
                        value={filters.customerItemCode}
                        onChange={(e) => setFilters((f) => ({ ...f, customerItemCode: e.target.value }))}
                        placeholder="Lọc..."
                        className="w-full text-xs font-normal bg-white/[0.05] text-white rounded border border-white/15 py-0.5 px-1.5 focus:outline-none focus:border-amber-500/60"
                      />
                    </div>
                  </th>
                  <th className="font-semibold px-2 py-2 text-center bg-white/[0.02]">ĐVT</th>
                  <th className="font-semibold px-2 py-2 text-right bg-white/[0.02]">SL PO</th>
                  <th className="font-semibold px-2 py-2 text-right bg-white/[0.02]">SL Chưa Giao</th>
                  <th className="font-semibold px-2 py-2 bg-white/[0.02]">Ngày PO</th>
                  <th className="font-semibold px-2 py-2 bg-white/[0.02]">Ngày Y/C</th>
                  <th className="font-semibold px-2 py-2 text-right bg-white/[0.02]">SL Cần Soạn</th>
                  <th className="font-semibold px-2 py-2 bg-white/[0.02]">Ngày Cần Giao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pagedLines.map((l) => {
                  const isChecked = checked.has(l.poTrackingLineId);
                  return (
                    <tr key={l.poTrackingLineId} className={cn("hover:bg-white/[0.02]", isChecked && "bg-amber-500/[0.07]")}>
                      <td className="px-2 py-1.5 bg-[#10121b] z-10" style={stickyStyle("check")}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(l.poTrackingLineId, l)}
                          className="h-4 w-4 rounded border-white/20 text-amber-500 focus:ring-amber-500/40 cursor-pointer"
                        />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-amber-400 whitespace-nowrap bg-[#10121b] z-10" style={stickyStyle("poCode")}>
                        {l.poCode}
                      </td>
                      <td
                        className="px-2 py-1.5 font-mono text-gray-300 whitespace-nowrap bg-[#10121b] z-10 border-r border-white/10"
                        style={stickyStyle("itemCode")}
                      >
                        {l.itemCode ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-white max-w-[240px] truncate" title={l.itemName}>
                        {l.itemName}
                      </td>
                      <td className="px-2 py-1.5 text-gray-400 font-mono whitespace-nowrap">{l.customerItemCode ?? "—"}</td>
                      <td className="px-2 py-1.5 text-center text-gray-400">{l.unit ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-300">{l.poQuantity ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold text-amber-400">{l.remainingQty ?? "—"}</td>
                      <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap">{formatDateVN(l.poDate)}</td>
                      <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap">{formatDateVN(l.requestedDeliveryDate)}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={0}
                          disabled={!isChecked}
                          value={qtyEdits[l.poTrackingLineId] ?? ""}
                          onChange={(e) => setQtyEdits((p) => ({ ...p, [l.poTrackingLineId]: e.target.value }))}
                          className="w-20 text-right text-xs bg-white/[0.07] text-white rounded-lg border border-white/15 py-1 px-1.5 font-mono focus:outline-none focus:border-amber-500/60 disabled:opacity-30"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="date"
                          disabled={!isChecked}
                          value={deliveryDateEdits[l.poTrackingLineId] ?? ""}
                          onChange={(e) => setDeliveryDateEdits((p) => ({ ...p, [l.poTrackingLineId]: e.target.value }))}
                          className="text-xs bg-white/[0.07] text-white rounded-lg border border-white/15 py-1 px-1.5 focus:outline-none focus:border-amber-500/60 disabled:opacity-30"
                        />
                      </td>
                    </tr>
                  );
                })}
                {filteredLines.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-2 py-6 text-center text-gray-500 italic">
                      Không có dòng mã hàng nào khớp bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {filteredLines.length > 0 && (
          <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
            <span>
              Tổng {filteredLines.length} dòng — Trang {currentPage}/{totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-gray-300 disabled:opacity-30 hover:bg-white/[0.08] transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Trước
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-gray-300 disabled:opacity-30 hover:bg-white/[0.08] transition-colors"
              >
                Sau <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <label className="text-xs text-gray-300 flex flex-col gap-1.5 mt-5">
          Ghi chú in trên phiếu soạn hàng
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="bg-white/[0.05] border border-white/15 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500/60 font-sans"
          />
        </label>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
          <p className="text-xs text-gray-400">
            Đã tích chọn <strong className="text-amber-400">{selectedCount}</strong> dòng hàng
          </p>
          <button
            onClick={handleCreate}
            disabled={saving || selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brandRed-600 to-amber-600 hover:from-brandRed-500 hover:to-amber-500 px-5 py-2.5 text-xs font-semibold text-white shadow-[0_0_20px_rgba(225,29,72,0.3)] border border-brandRed-500/40 disabled:opacity-40 transition-all active:scale-[0.98]"
          >
            <Save className="h-4 w-4" /> {saving ? "Đang tạo phiếu..." : "Tạo Phiếu Soạn Hàng"}
          </button>
        </div>
      </div>
    </div>
  );
}

