import { describe, it, expect, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";

const h = vi.hoisted(() => ({
  users: vi.fn(),
  lines: vi.fn(),
  events: vi.fn(),
  targets: vi.fn(),
  customers: vi.fn(),
  received: vi.fn(),
  poAgg: vi.fn(),
  snapshot: vi.fn(),
  plan: vi.fn(),
}));
vi.mock("@hoanggia/db", () => ({
  prisma: {
    user: { findMany: h.users },
    poTrackingLine: { findMany: h.lines },
    poDeliveryEvent: { findMany: h.events },
    salesTarget: { findMany: h.targets },
    customer: { findMany: h.customers },
    debtPayment: { aggregate: h.received },
  },
  getPoAggregates: h.poAgg,
}));
vi.mock("@/lib/debt-snapshot", () => ({ getDebtSnapshot: h.snapshot, getCollectionPlan: h.plan }));

import { getReportData } from "./report-metrics";
import { buildReportWorkbook } from "./report-workbook";
import { resolveReportPeriods } from "./report-period";

const d = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);
const NOW = d("2026-10-10");
const emptyDebt = { totalDebt: 0, overdueDebt: 0, badDebt: 0, noDueDebt: 0, invoiceCount: 0, noScheduleCount: 0, noScheduleAmount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  h.users.mockResolvedValue([
    { id: "u1", name: "Tùng" },
    { id: "u2", name: "Dung" },
  ]);
  h.lines.mockResolvedValue([
    { salesEmployeeId: "u1", itemCode: "SI01", poValue: 1000, poDate: d("2026-10-05") },
    { salesEmployeeId: "u1", itemCode: "ABC", poValue: 2000, poDate: d("2026-10-06") },
    { salesEmployeeId: "u1", itemCode: "sb7", poValue: 500, poDate: d("2026-09-15") },
    { salesEmployeeId: "u2", itemCode: null, poValue: 300, poDate: d("2026-10-02") },
  ]);
  h.events.mockResolvedValue([
    { salesEmployeeId: "u1", value: 800, eventDate: d("2026-10-03"), line: { itemCode: "SI01" } },
    { salesEmployeeId: "u1", value: 400, eventDate: d("2026-09-20"), line: { itemCode: "ABC" } },
    { salesEmployeeId: "u1", value: 100, eventDate: d("2026-08-10"), line: { itemCode: "SI9" } },
    { salesEmployeeId: "u2", value: 50, eventDate: d("2026-10-04"), line: { itemCode: null } },
  ]);
  h.targets.mockResolvedValue([
    { employeeId: "u1", year: 2026, month: 10, targetRevenue: 2000 },
    { employeeId: "u1", year: 2026, month: 9, targetRevenue: 1500 },
  ]);
  h.poAgg.mockResolvedValue([
    { salesEmployeeId: "u1", isOpen: true, remainingValue: 700 },
    { salesEmployeeId: "u1", isOpen: false, remainingValue: 0 },
    { salesEmployeeId: "u2", isOpen: true, remainingValue: 100 },
  ]);
  h.customers.mockResolvedValue([
    { customerCode: "K1", customerName: "Khách 1", createdAt: d("2026-10-04"), salesEmployeeId: "u1", salesEmployee: { name: "Tùng" } },
    { customerCode: "K2", customerName: "Khách 2", createdAt: d("2026-10-05"), salesEmployeeId: null, salesEmployee: null },
    { customerCode: "K3", customerName: "Khách 3", createdAt: d("2026-09-05"), salesEmployeeId: "u2", salesEmployee: { name: "Dung" } },
  ]);
  h.received.mockResolvedValue({ _sum: { amount: 5000 } });
  h.snapshot.mockResolvedValue({
    totalDebt: 1500,
    overdueDebt: 600,
    badDebt: 100,
    noDueDebt: 50,
    openInvoiceCount: 7,
    noScheduleCount: 3,
    noScheduleAmount: 400,
    perEmployee: new Map([["u1", { ...emptyDebt, totalDebt: 1000, overdueDebt: 250, invoiceCount: 4 }]]),
    overdueInvoices: [
      { invoiceNumber: "HD1", customerCode: "K1", customerName: "Khách 1", employeeName: "Tùng", dueDate: d("2026-08-01"), daysOverdue: 70, remaining: 250, status: "OVERDUE" },
    ],
  });
  h.plan.mockResolvedValue(
    new Map([
      ["u1", { planned: [100, 0, 0, 0, 0], collected: [40, 0, 0, 0, 0] }],
      ["", { planned: [0, 50, 0, 0, 0], collected: [0, 0, 0, 0, 0] }],
    ])
  );
});

async function monthReport(scope?: string) {
  return getReportData({ type: "month", periods: resolveReportPeriods("month", "2026-10")!, scopeEmployeeId: scope, now: NOW });
}
const val = (data: Awaited<ReturnType<typeof monthReport>>, employee: string, key: string) =>
  data.rows.find((r) => r.employee === employee && r.metricKey === key)!.values;

describe("getReportData - doanh số", () => {
  it("doanh số đơn hàng / đi hàng theo 3 tháng, tách sản xuất theo mã SI/SB (không phân biệt hoa thường)", async () => {
    const data = await monthReport();
    expect(val(data, "Tùng", "po_value")).toEqual([3000, 500, 0]);
    expect(val(data, "Tùng", "po_sx")).toEqual([1000, 500, 0]); // SI01 tháng 10; sb7 tháng 9
    expect(val(data, "Tùng", "delivered")).toEqual([800, 400, 100]);
    expect(val(data, "Tùng", "delivered_sx")).toEqual([800, 0, 100]);
    // dòng không có mã hàng: có trong doanh số tổng nhưng không phân loại được là sản xuất
    expect(val(data, "Dung", "po_value")).toEqual([300, 0, 0]);
    expect(val(data, "Dung", "po_sx")).toEqual([0, 0, 0]);
  });

  it("Cả phòng = tổng các nhân viên; chỉ tiêu + % hoàn thành (chỉ tháng)", async () => {
    const data = await monthReport();
    expect(val(data, "Cả phòng", "po_value")).toEqual([3300, 500, 0]);
    expect(val(data, "Cả phòng", "delivered")).toEqual([850, 400, 100]);
    expect(val(data, "Tùng", "target")).toEqual([2000, 1500, 0]);
    expect(val(data, "Tùng", "completion")[0]).toBe(40); // 800 / 2000
    expect(val(data, "Dung", "completion")[0]).toBeNull(); // không có chỉ tiêu
  });

  it("OIH: chỉ PO đang mở, chỉ kỳ hiện tại", async () => {
    const data = await monthReport();
    expect(val(data, "Tùng", "oih")).toEqual([700, null, null]);
    expect(val(data, "Cả phòng", "oih")).toEqual([800, null, null]);
  });

  it("khách hàng mới: theo NVKD, Cả phòng gồm cả khách chưa gán; danh sách chỉ kỳ hiện tại", async () => {
    const data = await monthReport();
    expect(val(data, "Tùng", "new_customers")).toEqual([1, 0, 0]);
    expect(val(data, "Dung", "new_customers")).toEqual([0, 1, 0]);
    expect(val(data, "Cả phòng", "new_customers")).toEqual([2, 1, 0]);
    expect(data.newCustomers.map((c) => c.customerCode)).toEqual(["K1", "K2"]);
    expect(data.newCustomers[1].employee).toBe("(Chưa gán)");
  });
});

describe("getReportData - công nợ & kế hoạch thu", () => {
  it("công nợ theo nhân viên (nhân viên không có hoá đơn = 0) và Cả phòng = toàn bộ hoá đơn", async () => {
    const data = await monthReport();
    expect(val(data, "Tùng", "debt_total")[0]).toBe(1000);
    expect(val(data, "Tùng", "debt_overdue_rate")[0]).toBe(25);
    expect(val(data, "Dung", "debt_total")[0]).toBe(0);
    expect(val(data, "Dung", "debt_overdue_rate")[0]).toBeNull();
    expect(val(data, "Cả phòng", "debt_total")[0]).toBe(1500);
    expect(val(data, "Cả phòng", "debt_noschedule_count")[0]).toBe(3);
  });

  it("kế hoạch thu cộng các tuần; Cả phòng gồm cả hoá đơn chưa gán; tổng tiền về chỉ ở Cả phòng", async () => {
    const data = await monthReport();
    expect(val(data, "Tùng", "plan_planned")[0]).toBe(100);
    expect(val(data, "Tùng", "plan_collected")[0]).toBe(40);
    expect(val(data, "Tùng", "plan_rate")[0]).toBe(40);
    expect(val(data, "Cả phòng", "plan_planned")[0]).toBe(150);
    expect(val(data, "Cả phòng", "total_received")[0]).toBe(5000);
    expect(data.rows.some((r) => r.employee === "Tùng" && r.metricKey === "total_received")).toBe(false);
  });

  it("kỳ đã kết thúc -> công nợ chốt cuối ngày cuối kỳ; kỳ đang diễn ra -> hiện tại", async () => {
    await getReportData({ type: "month", periods: resolveReportPeriods("month", "2026-09")!, now: NOW });
    expect(h.snapshot.mock.calls[0][0].asOfDate.toISOString()).toBe("2026-09-29T17:00:00.000Z"); // 30/09 0h VN
    await monthReport();
    expect(h.snapshot.mock.calls[1][0].asOfDate).toBeNull();
  });
});

describe("getReportData - báo cáo tuần & phân quyền", () => {
  it("tuần: không có chỉ tiêu, 1 cột kế hoạch thu cho cả tuần, so với 2 tuần trước", async () => {
    const periods = resolveReportPeriods("week", "2026-W41")!; // 05/10 - 11/10
    const data = await getReportData({ type: "week", periods, now: NOW });
    expect(data.metrics.some((m) => m.key === "target" || m.key === "completion")).toBe(false);
    expect(data.plan.bucketLabels).toEqual([periods[0].label]);
    // 03/10 (Thứ 7) thuộc tuần 40 = kỳ -1; 20/09 nằm ngoài 3 tuần (từ 21/09) nên không tính
    expect(val(data, "Tùng", "delivered")).toEqual([0, 800, 0]);
  });

  it("NVKD (scope): chỉ 1 người, không có dòng Cả phòng, truy vấn công nợ giới hạn theo người đó", async () => {
    h.users.mockResolvedValue([{ id: "u1", name: "Tùng" }]);
    const data = await monthReport("u1");
    expect(data.totalLabel).toBeNull();
    expect(data.rows.every((r) => r.employee === "Tùng")).toBe(true);
    expect(h.snapshot.mock.calls[0][0].where).toEqual({ salesEmployeeId: "u1" });
    expect(h.received).not.toHaveBeenCalled();
  });
});

describe("buildReportWorkbook", () => {
  it("có đủ sheet, 2 ô chọn có danh sách, công thức + giá trị tính sẵn đúng, sheet danh mục ẩn", async () => {
    const data = await monthReport();
    const buf = await (await buildReportWorkbook(data)).xlsx.writeBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);

    expect(wb.worksheets.map((s) => s.name)).toEqual(["Dashboard", "Dữ liệu", "Công nợ", "HĐ quá hạn", "Kế hoạch thu", "Khách hàng mới", "Cách tính", "Danh mục"]);
    expect(wb.getWorksheet("Danh mục")!.state).toBe("hidden");

    const dash = wb.getWorksheet("Dashboard")!;
    let empRow = 0;
    let metRow = 0;
    dash.eachRow((row, n) => {
      if (row.getCell(1).value === "Nhân viên:") empRow = n;
      if (row.getCell(1).value === "Chỉ số xếp hạng:") metRow = n;
    });
    expect(dash.getCell(empRow, 2).value).toBe("Cả phòng");
    expect(dash.getCell(empRow, 2).dataValidation.type).toBe("list");
    expect(dash.getCell(metRow, 2).value).toBe("Doanh số đi hàng");
    expect(dash.getCell(metRow, 2).dataValidation.formulae[0]).toContain("Danh mục");

    // Bảng 1: dòng "Doanh số đi hàng" của Cả phòng = 850, kỳ -1 = 400, tăng 112,5%
    let row = 0;
    dash.eachRow((r, n) => {
      if (r.getCell(2).value === "Doanh số đi hàng") row = n;
    });
    const cell = dash.getCell(row, 3).value as { formula: string; result: number };
    expect(cell.formula).toContain("SUMIFS");
    expect(cell.result).toBe(850);
    expect((dash.getCell(row, 4).value as { result: number }).result).toBe(400);
    expect((dash.getCell(row, 6).value as { result: number }).result).toBeCloseTo(850 / 400 - 1, 6);

    // Dữ liệu: có dòng của từng nhân viên × chỉ số, lọc được
    const ds = wb.getWorksheet("Dữ liệu")!;
    expect(ds.rowCount).toBe(1 + data.rows.length);
    expect(ds.autoFilter).toBeTruthy();

    // HĐ quá hạn + khách mới
    expect(wb.getWorksheet("HĐ quá hạn")!.getRow(2).getCell(5).value).toBe("HD1");
    expect(wb.getWorksheet("Khách hàng mới")!.getRow(2).getCell(3).value).toBe("K1");
  });
});
