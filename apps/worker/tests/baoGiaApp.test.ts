import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  process.env.BAO_GIA_DB_PATH = "/data/bao-gia/dev.db";
  return {
    users: vi.fn(),
    existing: vi.fn(),
    upsert: vi.fn((args: unknown) => ({ upsert: args })),
    deleteMany: vi.fn((args: unknown) => ({ deleteMany: args })),
    transaction: vi.fn(async (ops: unknown[]) => ops),
    logCreate: vi.fn(),
    logUpdate: vi.fn(),
  };
});

vi.mock("@hoanggia/db", () => ({
  prisma: {
    user: { findMany: h.users },
    quoteRequest: { findMany: h.existing, upsert: h.upsert, deleteMany: h.deleteMany },
    syncLog: { create: h.logCreate, update: h.logUpdate },
    $transaction: h.transaction,
  },
  QuoteStatus: {},
}));
vi.mock("../src/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { runBaoGiaAppSync } from "../src/sync/baoGiaApp";
import { cutoffMs, isOnOrAfterCutoff, mapAppQuote, mapAppStatus, vnDateParts, type AppQuoteRow } from "../src/sync/baoGiaMapping";

const msVN = (ymd: string, hms = "09:00:00") => new Date(`${ymd}T${hms}+07:00`).getTime();
const baseRow = (o: Partial<AppQuoteRow> = {}): AppQuoteRow => ({
  code: "BG-26-0900",
  status: "DA_CO_GIA_L1",
  finalResult: "DANG_THEO",
  requestedAt: msVN("2026-10-12"),
  updatedAt: msVN("2026-10-12", "10:00:00"),
  notes: null,
  deliveryAddress: null,
  potentialItems: null,
  customerName: "Cty ABC",
  customerType: "KHC",
  customerIndustry: "Thực phẩm",
  customerNationality: "Việt Nam",
  customerScale: "Vừa",
  customerAddress: "KCN A",
  salesUsername: "tandv",
  pkhName: "Nguyễn Thị Ly",
  ...o,
});

describe("mapAppStatus — 4 nhóm hiển thị", () => {
  it("chốt PO -> WON; huỷ/khách từ chối -> LOST; chờ/đang tính giá -> NOT_QUOTED; còn lại -> NEGOTIATING", () => {
    expect(mapAppStatus("DA_CHOT_PO", "CHOT_PO")).toBe("WON");
    expect(mapAppStatus("DA_CO_GIA_L2", "CHOT_PO")).toBe("WON"); // kết quả chốt thắng trạng thái tiến độ
    expect(mapAppStatus("DA_HUY", "DANG_THEO")).toBe("LOST");
    expect(mapAppStatus("DA_CO_GIA_L1", "KHACH_CHE_DAT")).toBe("LOST");
    expect(mapAppStatus("KHACH_PHAN_HOI", "DOI_THU_RE_HON")).toBe("LOST");
    expect(mapAppStatus("CHO_BAO_GIA", "DANG_THEO")).toBe("NOT_QUOTED");
    expect(mapAppStatus("DANG_TINH_GIA", null)).toBe("NOT_QUOTED");
    for (const s of ["BAO_GIA_MOT_PHAN", "DA_CO_GIA_L1", "KHACH_PHAN_HOI", "DA_CO_GIA_L2"]) {
      expect(mapAppStatus(s, "DANG_THEO")).toBe("NEGOTIATING");
    }
  });
});

describe("mốc 10/10/2026", () => {
  it("cutoff = 00:00 giờ VN ngày 10/10; dòng sheet từ ngày 10/10 trở đi bị bỏ, trước thì giữ", () => {
    expect(cutoffMs()).toBe(msVN("2026-10-10", "00:00:00"));
    expect(isOnOrAfterCutoff(2026, 10, 9)).toBe(false);
    expect(isOnOrAfterCutoff(2026, 10, 10)).toBe(true);
    expect(isOnOrAfterCutoff(2026, 11, 1)).toBe(true);
    expect(isOnOrAfterCutoff(2026, 9, 30)).toBe(false);
    expect(isOnOrAfterCutoff(2026, 10, null)).toBe(false);
  });
  it("ngày theo giờ VN: 23:30 VN ngày 11/10 vẫn là ngày 11 (không nhảy sang ngày UTC khác)", () => {
    expect(vnDateParts(msVN("2026-10-11", "23:30:00"))).toEqual({ year: 2026, month: 10, day: 11 });
    expect(vnDateParts(msVN("2026-10-12", "00:10:00"))).toEqual({ year: 2026, month: 10, day: 12 });
  });
});

describe("mapAppQuote", () => {
  it("điền đủ trường, gộp mã hàng, mã Phụ trách chuẩn của nhân viên", () => {
    const q = mapAppQuote(
      baseRow(),
      [
        { itemName: "Thùng carton 5 lớp", quantity: 5000, unit: "Cái", unitPriceL1: 12500, unitPriceL2: null, feedbackL1: "Khách chê đắt", feedbackL2: null },
        { itemName: "Tem decal", quantity: 20000, unit: "Cái", unitPriceL1: null, unitPriceL2: null, feedbackL1: null, feedbackL2: null },
      ],
      (u) => (u === "tandv" ? "TAN.DV" : u.toUpperCase())
    );
    expect(q).toMatchObject({
      sourceApp: "BAOGIA_APP",
      sourceCode: "BG-26-0900",
      year: 2026,
      month: 10,
      requestDay: 12,
      assigneeRaw: "TAN.DV",
      status: "NEGOTIATING",
      statusRaw: "DA_CO_GIA_L1",
      customerName: "Cty ABC",
      pricingStaff: "Nguyễn Thị Ly",
      unit: "Cái",
      sourceSheetName: "App báo giá",
    });
    expect(q.productInterest).toBe("Thùng carton 5 lớp; Tem decal");
    expect(q.quoteL1).toBe("Thùng carton 5 lớp: 12.500");
    expect(q.feedbackL1).toBe("Khách chê đắt");
    expect(q.quoteL2).toBeNull();
    expect(q.deliveryAddress).toBe("KCN A"); // thiếu địa chỉ của đơn -> lấy địa chỉ khách
  });
});

describe("runBaoGiaAppSync", () => {
  const item = { itemName: "Hộp", quantity: 1, unit: "Cái", unitPriceL1: null, unitPriceL2: null, feedbackL1: null, feedbackL2: null };
  const readOf = (rows: AppQuoteRow[]) => () => ({ rows, items: new Map(rows.map((r) => [r.code, [item]])) });

  beforeEach(() => {
    vi.clearAllMocks();
    h.users.mockResolvedValue([{ quoteAssigneeCode: "TAN.DV" }, { quoteAssigneeCode: "QUAN.DM" }]);
    h.logCreate.mockResolvedValue({ id: "log1" });
    h.existing.mockResolvedValue([]);
  });

  it("thêm báo giá mới: upsert theo mã, gán mã Phụ trách chuẩn, ghi SyncLog", async () => {
    const r = await runBaoGiaAppSync("MANUAL", readOf([baseRow(), baseRow({ code: "BG-26-0901", salesUsername: "quan.dm" })]));
    expect(r.status).toBe("SUCCESS");
    expect(h.upsert).toHaveBeenCalledTimes(2);
    const first = h.upsert.mock.calls[0][0] as { where: unknown; create: { assigneeRaw: string } };
    expect(first.where).toEqual({ sourceApp_sourceCode: { sourceApp: "BAOGIA_APP", sourceCode: "BG-26-0900" } });
    expect(first.create.assigneeRaw).toBe("TAN.DV");
    expect((h.upsert.mock.calls[1][0] as { create: { assigneeRaw: string } }).create.assigneeRaw).toBe("QUAN.DM");
    expect(h.logUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUCCESS", recordsSynced: 2 }) }));
  });

  it("chỉ ghi dòng đã đổi (updatedAt khác); xoá dòng đã bị xoá bên app báo giá", async () => {
    const same = baseRow({ code: "BG-26-0900" });
    const changed = baseRow({ code: "BG-26-0901", updatedAt: msVN("2026-10-13") });
    h.existing.mockResolvedValue([
      { sourceCode: "BG-26-0900", sourceUpdatedAt: new Date(same.updatedAt) },
      { sourceCode: "BG-26-0901", sourceUpdatedAt: new Date(msVN("2026-10-12")) },
      { sourceCode: "BG-26-0777", sourceUpdatedAt: new Date(msVN("2026-10-11")) }, // không còn trong app
    ]);
    await runBaoGiaAppSync("MANUAL", readOf([same, changed]));
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect((h.upsert.mock.calls[0][0] as { create: { sourceCode: string } }).create.sourceCode).toBe("BG-26-0901");
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { sourceApp: "BAOGIA_APP", sourceCode: { in: ["BG-26-0777"] } } });
  });

  it("cron không có thay đổi: không ghi DB, không ghi SyncLog", async () => {
    const row = baseRow();
    h.existing.mockResolvedValue([{ sourceCode: row.code, sourceUpdatedAt: new Date(row.updatedAt) }]);
    const r = await runBaoGiaAppSync("CRON", readOf([row]));
    expect(r).toMatchObject({ status: "SUCCESS", recordsSynced: 0 });
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.logCreate).not.toHaveBeenCalled();
  });

  it("THẤT BẠI: đọc file lỗi -> FAILED + ghi log lỗi, không đụng dữ liệu", async () => {
    const r = await runBaoGiaAppSync("CRON", () => {
      throw new Error("ENOENT: không thấy file");
    });
    expect(r.status).toBe("FAILED");
    expect(r.message).toContain("ENOENT");
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.logCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ jobType: "QUOTE_SYNC", status: "FAILED" }) });
  });
});
