import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";

// GET /api/shipment-slips/export: Excel thống kê đi hàng theo khoảng ngày.

const h = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({ prisma: { shipmentSlip: { findMany: h.findMany } } }));

import { GET } from "./route";

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/shipment-slips/export?${qs}`));

// Ngày lưu = 0h giờ VN quy ra UTC (01/10/2026 VN = 30/09 17:00 UTC).
const SLIPS = [
  {
    slipNumber: "PX001",
    slipDate: new Date("2026-09-30T17:00:00.000Z"),
    customerName: "Khách A",
    order: { orderCode: "PO-A" },
    items: [
      { itemCode: "H1", itemName: "Hộp 1", unit: "Cái", poSaleNumber: "PO-1", qtyActual: 10, qtyRequested: 12 },
      { itemCode: "H2", itemName: "Hộp 2", unit: "Cái", poSaleNumber: null, qtyActual: null, qtyRequested: 5 },
    ],
  },
  {
    slipNumber: "PX002",
    slipDate: new Date("2026-10-08T17:00:00.000Z"),
    customerName: "Khách B",
    order: null,
    items: [{ itemCode: "H1", itemName: "Hộp 1", unit: "Cái", poSaleNumber: "PO-2", qtyActual: 7, qtyRequested: null }],
  },
];

async function readWorkbook(res: Response) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());
  return wb;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u-admin", role: "ADMIN" } });
  h.findMany.mockResolvedValue(SLIPS);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/shipment-slips/export", () => {
  it("lọc theo khoảng ngày VN gồm cả 2 đầu: from 0h, to hết ngày", async () => {
    await get("from=2026-10-01&to=2026-10-09");
    const { slipDate } = h.findMany.mock.calls[0][0].where;
    expect(slipDate.gte.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(slipDate.lt.toISOString()).toBe("2026-10-09T17:00:00.000Z");
  });

  it("file có sheet Chi tiết: đúng số phiếu/mã/tên/ngày đi/số lượng, ngày hiện đúng ngày VN, tổng đúng", async () => {
    const res = await get("from=2026-10-01&to=2026-10-09");
    expect(res.status).toBe(200);
    const sheet = (await readWorkbook(res)).getWorksheet("Chi tiết")!;
    let headerRow = 0;
    sheet.eachRow((row, n) => {
      if (row.getCell(3).value === "Số phiếu") headerRow = n;
    });
    expect(headerRow).toBeGreaterThan(0);
    const row1 = sheet.getRow(headerRow + 1);
    expect(row1.getCell(1).value).toBe(1);
    expect((row1.getCell(2).value as Date).toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(row1.getCell(3).value).toBe("PX001");
    expect(row1.getCell(4).value).toBe("H1");
    expect(row1.getCell(5).value).toBe("Hộp 1");
    expect(row1.getCell(7).value).toBe(10); // thực xuất
    expect(sheet.getRow(headerRow + 2).getCell(7).value).toBe(5); // thiếu thực xuất -> số lượng yêu cầu
    expect(sheet.getRow(headerRow + 2).getCell(9).value).toBe("PO-A"); // không có PO dòng -> PO của phiếu
    expect(sheet.getRow(headerRow + 3).getCell(7).value).toBe(7);
    const total = sheet.getRow(headerRow + 4).getCell(7).value as { result: number };
    expect(total.result).toBe(22);
  });

  it("sheet Tổng hợp gộp theo mã hàng + ĐVT: H1 = 17 (2 phiếu), H2 = 5 (1 phiếu)", async () => {
    const sum = (await readWorkbook(await get("from=2026-10-01&to=2026-10-09"))).getWorksheet("Tổng hợp theo mã hàng")!;
    expect([sum.getRow(4).getCell(2).value, sum.getRow(4).getCell(5).value, sum.getRow(4).getCell(6).value]).toEqual(["H1", 2, 17]);
    expect([sum.getRow(5).getCell(2).value, sum.getRow(5).getCell(5).value, sum.getRow(5).getCell(6).value]).toEqual(["H2", 1, 5]);
  });

  it("THẤT BẠI: thiếu ngày / sai định dạng / đảo ngày / quá 366 ngày -> 400, không truy vấn DB", async () => {
    for (const qs of ["", "from=2026-10-01", "from=01/10/2026&to=09/10/2026", "from=2026-10-09&to=2026-10-01", "from=2025-01-01&to=2026-10-01"]) {
      expect((await get(qs)).status).toBe(400);
    }
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it("NVKD chỉ xuất được phiếu của mình (scope createdById)", async () => {
    h.auth.mockResolvedValue({ user: { id: "u-tung", role: "SALES" } });
    await get("from=2026-10-01&to=2026-10-09");
    expect(h.findMany.mock.calls[0][0].where.createdById).toBe("u-tung");
  });

  it("không có phiếu nào trong khoảng -> vẫn ra file hợp lệ", async () => {
    h.findMany.mockResolvedValue([]);
    const res = await get("from=2026-10-01&to=2026-10-09");
    expect(res.status).toBe(200);
    expect((await readWorkbook(res)).getWorksheet("Chi tiết")).toBeTruthy();
  });
});
