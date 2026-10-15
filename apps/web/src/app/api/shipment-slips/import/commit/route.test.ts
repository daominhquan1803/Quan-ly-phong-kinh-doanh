import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

// POST /api/shipment-slips/import/commit — nhập lại phiếu đã có: trùng số liệu nhưng file mới có thêm
// Số PO/Mã hàng của khách / Ghi chú / Giá tiền thì CẬP NHẬT thông tin (không sinh lại đợt giao, không hỏi ghi đè).

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  batchCreate: vi.fn(),
  batchUpdate: vi.fn(),
  slipFindUnique: vi.fn(),
  slipCreate: vi.fn(),
  slipUpdate: vi.fn(),
  itemDeleteMany: vi.fn(),
  itemCreateMany: vi.fn(),
  orderFind: vi.fn(),
  applyDeliveries: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({
  prisma: {
    shipmentSlipImportBatch: { create: h.batchCreate, update: h.batchUpdate },
    shipmentSlip: { findUnique: h.slipFindUnique, create: h.slipCreate, update: h.slipUpdate },
    shipmentSlipItem: { deleteMany: h.itemDeleteMany, createMany: h.itemCreateMany },
    order: { findUnique: h.orderFind },
  },
  applyShipmentSlipDeliveries: h.applyDeliveries,
}));

import { POST } from "./route";

const HEADERS = ["Số phiếu", "Tên khách", "Mã hàng", "Tên hàng", "Giá tiền", "Số PO bán", "Đơn vị", "SL thực xuất", "Ngày", "Số PO/ Mã hàng của khách", "Ghi chú"];
const MAPPING = {
  slipNumber: "Số phiếu",
  customerName: "Tên khách",
  itemCode: "Mã hàng",
  itemName: "Tên hàng",
  unitPrice: "Giá tiền",
  poSaleNumber: "Số PO bán",
  unit: "Đơn vị",
  qtyActual: "SL thực xuất",
  slipDate: "Ngày",
  poCustomerItemCode: "Số PO/ Mã hàng của khách",
  note: "Ghi chú",
};

function post(rows: (string | number)[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const form = new FormData();
  form.append("file", new File([new Uint8Array(buf)], "phieu.xlsx"));
  form.append("mapping", JSON.stringify(MAPPING));
  return POST(new NextRequest("http://localhost/api/shipment-slips/import/commit", { method: "POST", body: form }));
}

const existingSlip = (items: Record<string, unknown>[]) => ({
  id: "slip1",
  slipDate: new Date("2026-10-13T17:00:00.000Z"), // 14/10/2026 giờ VN
  items,
});
const oldItem = { poSaleNumber: "D09.26DT6", itemCode: "GCN04106", itemName: "Màng PE", qtyActual: 5, poCustomerItemCode: null, note: null, unitPrice: null };

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u-admin", role: "ADMIN" } });
  h.batchCreate.mockResolvedValue({ id: "batch1" });
  h.orderFind.mockResolvedValue(null);
  h.applyDeliveries.mockResolvedValue({ matchedCount: 0, unmatchedItems: [], skippedBeforeBaseline: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const ROW = ["BH04290", "CÔNG TY A", "GCN04106", "Màng PE", 98400, "D09.26DT6", "Cuộn", 5, "14/10/2026", "PO SS(V)-20260914-01", "Sản xuất"];

describe("nhập lại phiếu đã có", () => {
  it("trùng số liệu nhưng file có thêm Số PO/Mã hàng KH, Ghi chú, Giá tiền -> cập nhật các dòng, KHÔNG sinh lại đợt giao, không hỏi ghi đè", async () => {
    h.slipFindUnique.mockResolvedValue(existingSlip([oldItem]));
    const res = await post([HEADERS, ROW]);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ infoUpdatedCount: 1, skippedIdenticalCount: 0, conflicts: [] });
    expect(h.itemDeleteMany).toHaveBeenCalledWith({ where: { shipmentSlipId: "slip1" } });
    expect(h.itemCreateMany.mock.calls[0][0].data[0]).toMatchObject({
      shipmentSlipId: "slip1",
      poCustomerItemCode: "PO SS(V)-20260914-01",
      note: "Sản xuất",
      unitPrice: 98400,
    });
    expect(h.applyDeliveries).not.toHaveBeenCalled();
    expect(h.slipUpdate).not.toHaveBeenCalled();
  });

  it("trùng hoàn toàn (kể cả thông tin bổ sung) -> bỏ qua, không ghi gì", async () => {
    h.slipFindUnique.mockResolvedValue(
      existingSlip([{ ...oldItem, poCustomerItemCode: "PO SS(V)-20260914-01", note: "Sản xuất", unitPrice: "98400.00" }])
    );
    const json = await (await post([HEADERS, ROW])).json();
    expect(json).toMatchObject({ infoUpdatedCount: 0, skippedIdenticalCount: 1 });
    expect(h.itemDeleteMany).not.toHaveBeenCalled();
  });

  it("phiếu mới: lưu đủ Số PO/Mã hàng KH, Ghi chú, Giá tiền", async () => {
    h.slipFindUnique.mockResolvedValue(null);
    h.slipCreate.mockResolvedValue({ id: "new1" });
    const json = await (await post([HEADERS, ROW])).json();
    expect(json.createdCount).toBe(1);
    expect(h.itemCreateMany.mock.calls[0][0].data[0]).toMatchObject({ poCustomerItemCode: "PO SS(V)-20260914-01", note: "Sản xuất", unitPrice: 98400 });
  });

  it("khác số liệu (SL) vẫn là xung đột cần xác nhận, không tự ghi", async () => {
    h.slipFindUnique.mockResolvedValue(existingSlip([{ ...oldItem, qtyActual: 3 }]));
    const json = await (await post([HEADERS, ROW])).json();
    expect(json.conflicts).toHaveLength(1);
    expect(h.itemDeleteMany).not.toHaveBeenCalled();
  });
});
