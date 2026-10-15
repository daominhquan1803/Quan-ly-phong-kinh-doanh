import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildDormantCustomersWorkbook, buildDormantItemsWorkbook, buildInvoiceWorkbook } from "./stats-workbook";
import type { DormantCustomerView, DormantItemView, InvoiceRow } from "./stats-data";

const d = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);
const REF = d("2026-10-15");

async function reload(wb: ExcelJS.Workbook) {
  const out = new ExcelJS.Workbook();
  await out.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  return out;
}
function headerRowOf(ws: ExcelJS.Worksheet, firstHeader = "STT"): number {
  let n = 0;
  ws.eachRow((row, i) => {
    if (!n && row.getCell(1).value === firstHeader) n = i;
  });
  return n;
}

const hist = (poCode: string, date: string, itemCode: string, qty: number, value: number) => ({
  customerNorm: "PANASONIC", customerCode: "C.PANASONIC", poDate: d(date), poCode, itemCode, itemName: `Hàng ${itemCode}`, unit: "Cái", qty, value,
});
const CUSTOMER: DormantCustomerView = {
  customerNorm: "PANASONIC", customerCode: "C.PANASONIC", code: "PANASONIC", name: "Công ty Panasonic VN", ownerName: "Dung", inDirectory: true,
  lastPoDate: d("2026-08-01"), daysSince: 75, monthsSince: 2, lastSalesEmployeeId: "u2", truncated: false,
  poCount: 2, itemCount: 2, historyValue: 1500,
  history: [hist("PO2", "2026-08-01", "A1", 10, 1000), hist("PO1", "2026-07-25", "B2", 5, 500)],
};

describe("file Excel khách lâu chưa mua", () => {
  it("sheet Tổng quan + sheet Lịch sử 6 tháng: số liệu, ngày hiện đúng, tổng", async () => {
    const wb = await reload(await buildDormantCustomersWorkbook([CUSTOMER, { ...CUSTOMER, code: "MOI", name: "Khách chưa có DS", inDirectory: false, truncated: true, customerNorm: "MOI", history: [hist("PO9", "2026-02-01", "C3", 1, 100)], poCount: 1, itemCount: 1, historyValue: 100 }], "2", REF));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Tổng quan", "Lịch sử 6 tháng"]);
    const ov = wb.getWorksheet("Tổng quan")!;
    const h0 = headerRowOf(ov);
    expect(h0).toBeGreaterThan(0);
    const r1 = ov.getRow(h0 + 1);
    expect([r1.getCell(2).value, r1.getCell(3).value, r1.getCell(4).value]).toEqual(["PANASONIC", "Công ty Panasonic VN", "Dung"]);
    expect((r1.getCell(5).value as Date).toISOString().slice(0, 10)).toBe("2026-08-01"); // ngày PO cuối
    expect([r1.getCell(6).value, r1.getCell(7).value, r1.getCell(8).value, r1.getCell(9).value, r1.getCell(10).value]).toEqual([75, 2, 2, 2, 1500]);
    const note2 = ov.getRow(h0 + 2).getCell(11).value as string;
    expect(note2).toContain("Chưa có trong danh sách Khách hàng");
    expect(note2).toContain("chưa đủ 6 tháng");
    expect(((ov.getRow(h0 + 3).getCell(10).value as { result: number }).result)).toBe(1600);

    const dt = wb.getWorksheet("Lịch sử 6 tháng")!;
    const hd = headerRowOf(dt);
    const l1 = dt.getRow(hd + 1);
    expect([l1.getCell(2).value, l1.getCell(6).value, l1.getCell(7).value, l1.getCell(10).value, l1.getCell(11).value]).toEqual(["PANASONIC", "PO2", "A1", 10, 1000]);
    expect(dt.getRow(hd + 4).getCell(11).value).toMatchObject({ result: 1600 });
  });

  it("danh sách rỗng vẫn ra file hợp lệ", async () => {
    const wb = await reload(await buildDormantCustomersWorkbook([], "over3", REF));
    expect(wb.getWorksheet("Tổng quan")).toBeTruthy();
  });
});

describe("file Excel mã hàng lâu chưa mua", () => {
  it("mỗi dòng là 1 cặp khách + mã hàng, kèm lịch sử", async () => {
    const item: DormantItemView = { ...CUSTOMER, itemKey: "PANASONIC||B2", itemCode: "B2", itemName: "Hàng B2", historyQty: 12, historyValue: 1200, poCount: 2 } as unknown as DormantItemView;
    const wb = await reload(await buildDormantItemsWorkbook([item], "3", REF));
    const ov = wb.getWorksheet("Tổng quan")!;
    const r1 = ov.getRow(headerRowOf(ov) + 1);
    expect([r1.getCell(2).value, r1.getCell(5).value, r1.getCell(6).value, r1.getCell(11).value, r1.getCell(12).value]).toEqual(["PANASONIC", "B2", "Hàng B2", 12, 1200]);
    expect(wb.getWorksheet("Lịch sử 6 tháng")).toBeTruthy();
  });
});

describe("file Excel hoá đơn", () => {
  const inv = (n: string, customerCode: string, status: InvoiceRow["status"], total: number, paid: number): InvoiceRow => ({
    invoiceNumber: n, invoiceDate: d("2026-09-10"), dueDate: d("2026-10-10"), customerCode, customerName: customerCode, ownerName: "Dung",
    total, paid, remaining: Math.max(0, total - paid), status, lastPaymentDate: paid > 0 ? d("2026-09-20") : null,
  });

  it("cột số hoá đơn, ngày, hạn, tổng, trạng thái; nhiều khách có thêm sheet tổng hợp", async () => {
    const wb = await reload(await buildInvoiceWorkbook([inv("0001", "PANASONIC", "PAID", 1000, 1000), inv("0002", "PANASONIC", "PARTIAL", 2000, 500), inv("0003", "SAMSUNG", "UNPAID", 3000, 0)], "Tất cả khách hàng", "Toàn bộ thời gian", REF));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Hoá đơn", "Tổng hợp theo khách"]);
    const ws = wb.getWorksheet("Hoá đơn")!;
    const h0 = headerRowOf(ws);
    const r2 = ws.getRow(h0 + 2);
    expect(r2.getCell(2).value).toBe("0002");
    expect((r2.getCell(3).value as Date).toISOString().slice(0, 10)).toBe("2026-09-10");
    expect((r2.getCell(4).value as Date).toISOString().slice(0, 10)).toBe("2026-10-10");
    expect([r2.getCell(8).value, r2.getCell(9).value, r2.getCell(10).value, r2.getCell(11).value]).toEqual([2000, 500, 1500, "Thanh toán một phần"]);
    expect(ws.getRow(h0 + 4).getCell(8).value).toMatchObject({ result: 6000 });
    const sum = wb.getWorksheet("Tổng hợp theo khách")!;
    const s1 = sum.getRow(headerRowOf(sum) + 1);
    expect([s1.getCell(2).value, s1.getCell(8).value]).toEqual(["SAMSUNG", 3000]); // còn lại nhiều nhất lên đầu
  });

  it("1 khách: không có sheet tổng hợp", async () => {
    const wb = await reload(await buildInvoiceWorkbook([inv("0001", "PANASONIC", "PAID", 1000, 1000)], "PANASONIC", "Tháng 09/2026", REF));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Hoá đơn"]);
  });
});
