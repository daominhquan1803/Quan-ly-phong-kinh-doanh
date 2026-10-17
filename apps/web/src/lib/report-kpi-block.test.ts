import { describe, it, expect, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";

const h = vi.hoisted(() => ({
  users: vi.fn(), lines: vi.fn(), events: vi.fn(), targets: vi.fn(), customers: vi.fn(), received: vi.fn(),
  poAgg: vi.fn(), snapshot: vi.fn(), plan: vi.fn(), oihAsOf: vi.fn(), tripsP: vi.fn(), tripsS: vi.fn(), stepsOverdue: vi.fn(),
}));
vi.mock("@hoanggia/db", () => ({
  prisma: {
    user: { findMany: h.users },
    poTrackingLine: { findMany: h.lines },
    poDeliveryEvent: { findMany: h.events },
    salesTarget: { findMany: h.targets },
    customer: { findMany: h.customers },
    debtPayment: { aggregate: h.received },
    businessTripRequest: { findMany: h.tripsP },
    businessTripSupporter: { findMany: h.tripsS },
    businessTripStop: { findMany: h.stepsOverdue },
  },
  getPoAggregates: h.poAgg,
}));
vi.mock("@/lib/dashboard-metrics", () => ({ getOihAsOf: h.oihAsOf }));
vi.mock("@/lib/debt-snapshot", () => ({ getDebtSnapshot: h.snapshot, getCollectionPlan: h.plan }));

import { getReportData } from "./report-metrics";
import { buildReportWorkbook, buildReportFile } from "./report-workbook";
import { resolveReportPeriods } from "./report-period";

const d = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);
const NOW = d("2026-10-19");

beforeEach(() => {
  vi.clearAllMocks();
  h.users.mockResolvedValue([{ id: "u1", name: "Tùng" }, { id: "u2", name: "Dung" }]);
  h.lines.mockResolvedValue([]);
  // Đi hàng: u1 tháng 10 = 700 + 300; u2 = 400; một đợt tháng 9 (không tính vào luỹ kế tháng 10)
  h.events.mockResolvedValue([
    { salesEmployeeId: "u1", value: 700, eventDate: d("2026-10-03"), line: { itemCode: "SI01" } },
    { salesEmployeeId: "u1", value: 300, eventDate: d("2026-10-14"), line: { itemCode: "ABC" } },
    { salesEmployeeId: "u2", value: 400, eventDate: d("2026-10-15"), line: { itemCode: "ABC" } },
    { salesEmployeeId: "u1", value: 9999, eventDate: d("2026-09-20"), line: { itemCode: "ABC" } },
    { salesEmployeeId: "u1", value: 5000, eventDate: d("2026-10-25"), line: { itemCode: "ABC" } }, // sau cuối tuần 42 (18/10)
  ]);
  h.targets.mockResolvedValue([
    { employeeId: "u1", year: 2026, month: 10, targetRevenue: 2000 },
    { employeeId: "u2", year: 2026, month: 10, targetRevenue: 0 },
  ]);
  h.oihAsOf.mockResolvedValue(new Map());
  h.tripsP.mockResolvedValue([]);
  h.tripsS.mockResolvedValue([]);
  h.stepsOverdue.mockResolvedValue([]);
  h.poAgg.mockResolvedValue([]);
  h.customers.mockResolvedValue([]);
  h.received.mockResolvedValue({ _sum: { amount: 0 } });
  h.snapshot.mockResolvedValue({
    totalDebt: 0, overdueDebt: 0, badDebt: 0, noDueDebt: 0, openInvoiceCount: 0, noScheduleCount: 0, noScheduleAmount: 0,
    perEmployee: new Map(), overdueInvoices: [],
  });
  h.plan.mockResolvedValue(new Map());
});

describe("doanh số đi hàng so với KPI", () => {
  it("báo cáo tháng: Cả phòng = tổng nhân viên; % đạt = đi hàng ÷ chỉ tiêu; nhân viên không có chỉ tiêu không có %", async () => {
    const data = await getReportData({ type: "month", periods: resolveReportPeriods("month", "2026-10")!, now: NOW });
    expect(data.kpi.periodLabel).toBe("Tháng 10/2026");
    expect(data.kpi.rows).toEqual([
      { employee: "Cả phòng", delivered: 700 + 300 + 400 + 5000, target: 2000 },
      { employee: "Tùng", delivered: 700 + 300 + 5000, target: 2000 },
      { employee: "Dung", delivered: 400, target: 0 },
    ]);
  });

  it("báo cáo tuần: luỹ kế tháng chứa ngày cuối tuần, tới hết tuần (không tính đợt giao sau tuần, không tính tháng trước)", async () => {
    const data = await getReportData({ type: "week", periods: resolveReportPeriods("week", "2026-W42")!, now: NOW }); // 12/10–18/10
    expect(data.kpi.periodLabel).toBe("Luỹ kế tháng 10/2026 (01/10–18/10)");
    const total = data.kpi.rows[0];
    expect(total).toEqual({ employee: "Cả phòng", delivered: 700 + 300 + 400, target: 2000 });
    expect(data.kpi.rows.find((r) => r.employee === "Tùng")).toEqual({ employee: "Tùng", delivered: 1000, target: 2000 });
  });

  it("NVKD (scope 1 người): chỉ 1 dòng, không có Cả phòng", async () => {
    h.users.mockResolvedValue([{ id: "u1", name: "Tùng" }]);
    const data = await getReportData({ type: "month", periods: resolveReportPeriods("month", "2026-10")!, scopeEmployeeId: "u1", now: NOW });
    expect(data.kpi.rows.map((r) => r.employee)).toEqual(["Tùng"]);
  });
});

describe("Excel: khối KPI ở đầu Dashboard", () => {
  async function load(type: "month" | "week", period: string) {
    const data = await getReportData({ type, periods: resolveReportPeriods(type, period)!, now: NOW });
    const buf = await (await buildReportWorkbook(data)).xlsx.writeBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    return wb.getWorksheet("Dashboard")!;
  }
  const find = (ws: ExcelJS.Worksheet, text: string) => {
    let hit: { row: number; col: number } | null = null;
    ws.eachRow((row, n) => row.eachCell((cell, c) => { if (!hit && cell.value === text) hit = { row: n, col: c }; }));
    return hit as { row: number; col: number } | null;
  };

  it("thẻ tổng doanh số đi hàng, KPI, % đạt và bảng từng nhân viên có hạng + thanh tiến độ", async () => {
    const ws = await load("month", "2026-10");
    const totalCard = find(ws, "TỔNG DOANH SỐ ĐI HÀNG (CẢ PHÒNG)")!;
    expect(ws.getCell(totalCard.row + 1, totalCard.col).value).toBe(700 + 300 + 400 + 5000);
    const kpiCard = find(ws, "KPI — CHỈ TIÊU DOANH SỐ THÁNG")!;
    expect(ws.getCell(kpiCard.row + 1, kpiCard.col).value).toBe(2000);
    const pctCard = find(ws, "ĐẠT SO VỚI KPI")!;
    const pct = ws.getCell(pctCard.row + 1, pctCard.col).value as { formula: string; result: number };
    expect(pct.formula).toContain("/");
    expect(pct.result).toBeCloseTo(6400 / 2000, 6);

    const head = find(ws, "Hạng")!;
    const rows = [1, 2, 3].map((i) => ({
      name: ws.getCell(head.row + i, 2).value,
      pct: (ws.getCell(head.row + i, 6).value as { result: number | string }).result,
      bar: (ws.getCell(head.row + i, 9).value as { result: string }).result,
    }));
    expect(rows.map((r) => r.name)).toEqual(["Cả phòng", "Tùng", "Dung"]);
    expect(rows[1].pct).toBeCloseTo(6000 / 2000, 6);
    expect(rows[1].bar).toBe("█".repeat(30)); // trần 30 ô
    expect(rows[2].pct || "").toBe(""); // Dung chưa có chỉ tiêu (ô rỗng khi đọc lại)
    expect(ws.getCell(head.row + 2, 1).value).toBe(1); // hạng 1 = Tùng (Dung không có KPI nên không xếp hạng)
    expect(ws.getCell(head.row + 3, 1).value || "").toBe("");
  });

  it("báo cáo tuần: tiêu đề khối nêu rõ luỹ kế tháng; vẫn dựng được file có biểu đồ", async () => {
    const ws = await load("week", "2026-W42");
    expect(find(ws, "DOANH SỐ ĐI HÀNG SO VỚI KPI — Luỹ kế tháng 10/2026 (01/10–18/10)")).not.toBeNull();
    const data = await getReportData({ type: "week", periods: resolveReportPeriods("week", "2026-W42")!, now: NOW });
    const file = await buildReportFile(data);
    expect(file.byteLength).toBeGreaterThan(5000);
  });
});
