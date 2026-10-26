import { describe, it, expect, vi } from "vitest";
import ExcelJS from "exceljs";

vi.mock("@hoanggia/db", () => ({ prisma: {}, normalizeCustomerCode: (s: string) => s }));

import { classifyItem, groupByKeywords, groupsText } from "./product-groups";
import { keyOfLabel, INDUSTRIES, STAGES, profileCompleteness, profilePenalty } from "./customer-profile";
import { provinceOf, statusOf, suggestStage, type CustomerReport, type CustomerReportRow } from "./customer-report";
import { buildCustomerReportFile, HEADER_ROW, LIST_COLUMNS, LIST_SHEET } from "./customer-report-workbook";
import { diffImport } from "./customer-report-import";
import { computeKpiScores } from "./kpi-metrics";

const DAY = 86_400_000;
const NOW = new Date("2026-10-20T05:00:00Z").getTime();

describe("nhóm sản phẩm", () => {
  it("gán tay > danh mục AMIS > từ khoá tên hàng > Khác", () => {
    expect(classifyItem({ itemCode: "X", itemName: "Pallet nhựa" }, { override: "THUNG_HOP" })).toBe("THUNG_HOP");
    expect(classifyItem({ itemCode: "X", itemName: "abc" }, { category: "Túi Nylon" })).toBe("TUI_NHUA");
    expect(groupByKeywords("Nhãn PP Sữa tắm 105mmx52mm")).toBe("TEM_NHAN");
    expect(groupByKeywords("Tờ HDSD ANTIFREEZE INSTRUCTION 210mmx297mm")).toBe("HDSD");
    expect(groupByKeywords("Cuộn ống PE khổ 15cm")).toBe("MANG_PE");
    expect(groupByKeywords("Tấm PE 470x270mm")).toBe("MANG_PE");
    expect(groupByKeywords("Túi PA/PE 500x700mm")).toBe("TUI_NHUA");
    expect(groupByKeywords("Băng dính 48mmx100m")).toBe("BANG_DINH");
    expect(groupByKeywords("Thùng carton 5 lớp")).toBe("THUNG_HOP");
    expect(groupByKeywords("Dây đai PP 15mm")).toBe("DAY_DAI");
    expect(classifyItem({ itemCode: "X", itemName: "Pallet nhựa đen 1200x1000" }, {})).toBe("PALLET");
    expect(classifyItem({ itemCode: "X", itemName: "Mực WaxPremium 110mmx300m" }, {})).toBe("MUC_IN");
    expect(classifyItem({ itemCode: "X", itemName: "PP Bag 360mm" }, {})).toBe("TUI_NHUA");
    expect(classifyItem({ itemCode: "X", itemName: "Phong bì 250x340mm" }, {})).toBe("HDSD");
    expect(classifyItem({ itemCode: "X", itemName: "Standee Agribank 94.56mmx 147.5mm" }, {})).toBe("HDSD");
    expect(classifyItem({ itemCode: "X", itemName: "Sổ F-011A 297x210mm" }, {})).toBe("HDSD");
    expect(classifyItem({ itemCode: "X", itemName: "Tờ F-025A 297x210mm" }, {})).toBe("HDSD");
    expect(classifyItem({ itemCode: "X", itemName: "Màng PE cuốn pallet 50cm*400m" }, {})).toBe("MANG_PE");
    expect(classifyItem({ itemCode: "X", itemName: "Mực in Wax Resin 110mmx300m" }, {})).toBe("MUC_IN");
    expect(classifyItem({ itemCode: "X", itemName: "Ruy băng mã vạch Ribbon in Wax110mmx300m" }, {})).toBe("MUC_IN");
    expect(classifyItem({ itemCode: "X", itemName: "Hạt chống ẩm Silicagel 20gram" }, {})).toBe("CHONG_AM");
    expect(classifyItem({ itemCode: "X", itemName: "Túi bột chống ẩm 1kg" }, {})).toBe("CHONG_AM");
    expect(classifyItem({ itemCode: "X", itemName: "Tem giấy in(tem mực, loại mực) 88x140mm" }, {})).toBe("TEM_NHAN");
    expect(classifyItem({ itemCode: "X", itemName: "Nhãn decal giấy Sticker A Ốc sên và Mực 90mmx45mm" }, {})).toBe("TEM_NHAN");
  });
  it("mô tả % theo nhóm, bỏ nhóm dưới 5%", () => {
    expect(groupsText({ TEM_NHAN: 620, TUI_NHUA: 350, BANG_DINH: 30 })).toBe("Tem nhãn 62% · Túi nhựa 35%");
  });
});

describe("hồ sơ khách", () => {
  it("đổi nhãn tiếng Việt (ô chọn Excel) về mã; giá trị lạ = undefined; trống = null", () => {
    expect(keyOfLabel(INDUSTRIES, "Dược – Y tế")).toBe("DUOC_YTE");
    expect(keyOfLabel(STAGES, "mua đều")).toBe("REGULAR");
    expect(keyOfLabel(STAGES, "REGULAR")).toBe("REGULAR");
    expect(keyOfLabel(STAGES, "Đang đàm phán")).toBeUndefined();
    expect(keyOfLabel(STAGES, "  ")).toBeNull();
  });
  it("% đầy đủ trên 7 mục; KPI trừ 2đ dưới 90%, 5đ dưới 70%", () => {
    const full = { address: "KCN", industry: "DIEN_TU", staffSize: "LT50", ownership: "FDI", contactPerson: "A", contactPhone: "09", stage: "REGULAR", potentialYear: 1e9 };
    expect(profileCompleteness(full).pct).toBe(100);
    const r = profileCompleteness({ ...full, contactPhone: null, stage: null });
    expect(r.pct).toBe(71);
    expect(r.missing).toEqual(["Người liên hệ + SĐT", "Tiến trình (xác nhận)"]);
    expect([profilePenalty(95), profilePenalty(85), profilePenalty(60), profilePenalty(null)]).toEqual([0, 2, 5, 0]);
  });
  it("KPI NVKD: trừ điểm hồ sơ khi có số liệu", () => {
    const base = {
      targetRevenue: 1000, actualRevenue: 1000, weightRevenue: 30, targetRevenueSX: 400, actualRevenueSX: 400, weightRevenueSX: 20,
      targetNewCustomers: 2, actualNewCustomers: 2, weightNewCustomers: 10, debtOverduePct: 10, debtCollectionRatePct: 100,
      visitTarget: 10, approvedVisitCount: 10, weightVisit: 10, violationCount: 0, weekScore: 8,
    };
    expect(computeKpiScores(base).profilePenalty).toBe(0);
    const r = computeKpiScores({ ...base, profileAbPct: 75 });
    expect(r.profilePenalty).toBe(2);
    expect(r.totalScore).toBe(98);
  });
});

describe("tiến trình gợi ý & tình trạng", () => {
  const base = { lost: false, ordersAll: 10, firstOrder: NOW - 400 * DAY, lastOrder: NOW - 10 * DAY, risky: false, last6: 100, prev6: 100, quotedOrNeed: false, now: NOW };
  it("gợi ý bước", () => {
    expect(suggestStage({ ...base, lastOrder: null, ordersAll: 0, firstOrder: null })).toBe("PROSPECT");
    expect(suggestStage({ ...base, lastOrder: null, ordersAll: 0, firstOrder: null, quotedOrNeed: true })).toBe("QUOTED");
    expect(suggestStage({ ...base, ordersAll: 2, firstOrder: NOW - 30 * DAY })).toBe("TRIAL");
    expect(suggestStage(base)).toBe("REGULAR");
    expect(suggestStage({ ...base, last6: 40, prev6: 100 })).toBe("DECLINING");
    expect(suggestStage({ ...base, risky: true })).toBe("DECLINING");
    expect(suggestStage({ ...base, lastOrder: NOW - 200 * DAY })).toBe("STOPPED");
    expect(suggestStage({ ...base, lost: true })).toBe("STOPPED");
  });
  it("tình trạng", () => {
    const s = (x: Partial<Parameters<typeof statusOf>[0]>) => statusOf({ lost: false, risky: false, firstOrder: NOW - 400 * DAY, lastOrder: NOW - 10 * DAY, now: NOW, ...x });
    expect(s({})).toBe("ACTIVE");
    expect(s({ firstOrder: NOW - 30 * DAY })).toBe("NEW");
    expect(s({ risky: true })).toBe("RISK");
    expect(s({ lastOrder: NOW - 200 * DAY })).toBe("SLEEP");
    expect(s({ lastOrder: NOW - 400 * DAY })).toBe("INACTIVE");
    expect(s({ lastOrder: null, firstOrder: null })).toBe("NEVER");
    expect(s({ lost: true })).toBe("LOST");
  });
  it("tỉnh từ địa chỉ", () => {
    expect(provinceOf("Lô CN3-3 KCN Điềm Thụy, Xã Điềm Thụy, Tỉnh Thái Nguyên, Việt Nam")).toBe("Thái Nguyên");
    expect(provinceOf("Tổ dân phố Kiều Trung - phường An Hải - thành phố Hải Phòng")).toBe("Hải Phòng");
    expect(provinceOf("Số 7 đường TS11 KCN Tiên Sơn, Xã Đại Đồng, Tỉnh Bắc Ninh, Việt Nam.")).toBe("Bắc Ninh");
    expect(provinceOf(null)).toBeNull();
  });
});

const row = (over: Partial<CustomerReportRow>): CustomerReportRow => ({
  id: "c1", customerCode: "KH1", customerName: "Khách 1", employeeId: "u1", employeeName: "An", address: "KCN Quế Võ, Tỉnh Bắc Ninh", addressAuto: true,
  province: "Bắc Ninh", industry: null, staffSize: null, ownership: null, contactPerson: null, contactPhone: null, competitors: null, potentialYear: null,
  painPoint: null, tier: "A", pattern: "REGULAR", orders12: 5, value12: 500e6, gap: null, firstOrderAt: null, lastOrderAt: "2026-10-01T00:00:00Z",
  groups: { TEM_NHAN: 500e6 }, groupsText: "Tem nhãn 100%", topGroup: "TEM_NHAN", stage: null, stageSuggested: "REGULAR", stageEffective: "REGULAR",
  stagePrev: null, status: "ACTIVE", riskLevel: null, lastTouchAt: null, issue: null, unpaidDebt: 0, overdueDebt: 0, completeness: 14, missing: [],
  ...over,
});

describe("Excel: xuất -> sửa -> nhập lại", () => {
  it("file có 4 sheet, dashboard dùng công thức, có biểu đồ; nhập lại chỉ lấy ô sửa, bỏ ô trống và giá trị lạ", async () => {
    const rows = [row({}), row({ id: "c2", customerCode: "KH2", customerName: "Khách 2", tier: "B", industry: "DIEN_TU", contactPerson: "Chị Hà" })];
    const report: CustomerReport = { generatedAt: new Date(NOW).toISOString(), rows, employees: [{ id: "u1", name: "An" }], summary: [], unclassifiedItems: [], prevSnapshot: null };
    const buf = await buildCustomerReportFile(report, rows, { scopeLabel: "Cả phòng" });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual(["Dashboard", LIST_SHEET, "Khách x nhóm hàng", "Danh mục"]);
    const dash = wb.getWorksheet("Dashboard")!;
    expect((dash.getCell(5, 1).value as { formula: string }).formula).toContain("COUNTA(");
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files).some((f) => /^xl\/charts\/chart\d+\.xml$/.test(f))).toBe(true);

    // NVKD sửa file
    const list = wb.getWorksheet(LIST_SHEET)!;
    const col = (key: string) => LIST_COLUMNS.findIndex((c) => c.key === key) + 1;
    const r1 = HEADER_ROW + 1;
    list.getCell(r1, col("industry")).value = "Dược – Y tế";
    list.getCell(r1, col("stage")).value = "Mua đều";
    list.getCell(r1, col("potentialYear")).value = 1200000000;
    list.getCell(r1, col("contactPhone")).value = "0912 345 678";
    list.getCell(r1 + 1, col("staffSize")).value = "Rất to"; // giá trị lạ
    list.getCell(r1 + 1, col("contactPerson")).value = null; // để trống -> giữ nguyên
    const edited = Buffer.from(await wb.xlsx.writeBuffer());

    const res = await diffImport(edited, rows);
    expect(res.rowsRead).toBe(2);
    expect(res.changes.map((c) => `${c.customerCode}.${c.field}=${c.to}`).sort()).toEqual([
      "KH1.contactPhone=0912 345 678",
      "KH1.industry=DUOC_YTE",
      "KH1.potentialYear=1200000000",
      "KH1.stage=REGULAR",
    ]);
    expect(res.errors.some((e) => e.includes("Rất to"))).toBe(true);
  });

  it("mã khách không thuộc phạm vi người nhập thì bỏ qua", async () => {
    const rows = [row({})];
    const report: CustomerReport = { generatedAt: new Date(NOW).toISOString(), rows, employees: [], summary: [], unclassifiedItems: [], prevSnapshot: null };
    const buf = await buildCustomerReportFile(report, rows, { scopeLabel: "An" });
    const res = await diffImport(buf, []); // NVKD khác nhập file này
    expect(res.changes).toHaveLength(0);
    expect(res.errors[0]).toContain("KH1");
  });
});
