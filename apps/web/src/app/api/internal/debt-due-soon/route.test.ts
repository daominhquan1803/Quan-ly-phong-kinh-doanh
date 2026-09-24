import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Test HÀNH VI của route nội bộ /api/internal/debt-due-soon với DB giả (không chạm DB thật).
// Prisma giả tự áp điều kiện `where` (dueDate / PKD1 / OR-NOT) lên dữ liệu mẫu, nên các ca
// "NVKD không thuộc PKD1" kiểm được ngữ nghĩa của điều kiện lọc chứ không chỉ chuỗi where.
// Mọi nguồn hoá đơn (kể cả BASELINE) đều được nhắc — không còn lọc theo `source`.

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

type Emp = { name: string; notifyEmail: string | null; email: string | null; phone: string | null; active: boolean; amisEmployeeCode: string | null; includeInSalesStats: boolean };
interface Inv {
  id: string;
  customerCode: string;
  customerName: string;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  dueDate: Date | null;
  originalAmount: unknown;
  paidAmount: unknown;
  source: string;
  salesEmployeeId: string | null;
  salesEmployee: Emp | null;
}
interface Cust {
  customerCode: string;
  customerName: string;
  contactPerson: string | null;
  email: string | null;
  manualOverdueReminderBase: number | null;
}

const db = vi.hoisted(() => ({
  invoices: [] as unknown[],
  logs: [] as { invoiceId: string; milestone: string; dueDate: Date; occurrence: number }[],
  customers: [] as unknown[],
}));

function matchEmp(emp: Emp, cond: Record<string, unknown>): boolean {
  return Object.entries(cond).every(([k, v]) => {
    const actual = (emp as unknown as Record<string, unknown>)[k];
    if (v && typeof v === "object" && "not" in v) return actual !== (v as { not: unknown }).not;
    return actual === v;
  });
}

vi.mock("@hoanggia/db", () => {
  const invoiceFindMany = vi.fn(async (args: { where: Record<string, any> }) => {
    const w = args.where;
    let list = db.invoices as Inv[];
    if (w.dueDate === null) list = list.filter((i) => i.dueDate === null);
    else if (w.dueDate && "not" in w.dueDate) list = list.filter((i) => i.dueDate !== null);
    if (w.salesEmployee) list = list.filter((i) => i.salesEmployee !== null && matchEmp(i.salesEmployee, w.salesEmployee));
    if (w.OR) {
      list = list.filter((i) =>
        (w.OR as Record<string, any>[]).some((c) =>
          "salesEmployeeId" in c ? i.salesEmployeeId === c.salesEmployeeId : i.salesEmployee !== null && !matchEmp(i.salesEmployee, c.salesEmployee.NOT)
        )
      );
    }
    return list;
  });
  return {
    prisma: {
      debtInvoice: { findMany: invoiceFindMany },
      debtReminderLog: {
        findMany: vi.fn(async (args: { where: { invoiceId: { in: string[] } } }) => db.logs.filter((l) => args.where.invoiceId.in.includes(l.invoiceId))),
      },
      customer: { findMany: vi.fn(async () => db.customers) },
    },
  };
});

import { GET } from "./route";
import { prisma } from "@hoanggia/db";

const NOW = new Date(2026, 8, 19, 8, 0, 0); // Thứ 7 19/09/2026
const day = (offset: number) => new Date(2026, 8, 19 + offset); // 00:00 ngày-lịch
// Giả Prisma.Decimal: Number(x) phải ra đúng giá trị (edge 18).
const dec = (n: number) => ({ valueOf: () => n, toString: () => String(n) });

const emp = (over: Partial<Emp> = {}): Emp => ({
  name: "Ngô Thanh Tùng",
  notifyEmail: "tung.thuc@gmail.com",
  email: "tung@hoanggia.local",
  phone: "0900000001",
  active: true,
  amisEmployeeCode: "THANHTUNG",
  includeInSalesStats: true,
  ...over,
});

let seq = 0;
function inv(over: Partial<Inv> = {}): Inv {
  seq++;
  const salesEmployee = "salesEmployee" in over ? over.salesEmployee! : emp();
  return {
    id: `inv${seq}`,
    customerCode: "KH1",
    customerName: "Công ty KH1",
    invoiceNumber: `HD${seq}`,
    invoiceDate: day(-30),
    dueDate: day(7),
    originalAmount: dec(1000),
    paidAmount: dec(0),
    source: "NEW_INVOICE",
    salesEmployeeId: salesEmployee ? "u-tung" : null,
    salesEmployee,
    ...over,
  };
}
const cust = (over: Partial<Cust> = {}): Cust => ({
  customerCode: "KH1",
  customerName: "Công ty KH1 (chuẩn)",
  contactPerson: "Chị Lan",
  email: "ketoan@kh1.com",
  manualOverdueReminderBase: null,
  ...over,
});

async function call(query = "", token: string | null = "tok") {
  const req = new NextRequest(`http://localhost/api/internal/debt-due-soon${query}`, { headers: token ? { "x-internal-token": token } : {} });
  const res = await GET(req);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  seq = 0;
  db.invoices = [];
  db.logs = [];
  db.customers = [cust()];
  process.env.INTERNAL_SYNC_TOKEN = "tok";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.mocked(prisma.debtInvoice.findMany).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/internal/debt-due-soon - xác thực và tham số", () => {
  it("thiếu / sai token -> 401 và KHÔNG đụng DB", async () => {
    expect((await call("", null)).status).toBe(401);
    expect((await call("", "sai")).status).toBe(401);
    expect(prisma.debtInvoice.findMany).not.toHaveBeenCalled();
  });

  it("chưa cấu hình INTERNAL_SYNC_TOKEN -> 401 (không mở cửa cho request không token)", async () => {
    delete process.env.INTERNAL_SYNC_TOKEN;
    expect((await call("", null)).status).toBe(401);
  });

  it("milestone không hợp lệ -> 400", async () => {
    const r = await call("?milestone=D3");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/milestone/);
  });

  it("lỗi DB -> 500 với message tiếng Việt, không lộ chi tiết", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(prisma.debtInvoice.findMany).mockRejectedValueOnce(new Error("boom secret"));
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.body.error).toBe("Không lấy được danh sách công nợ tới hạn nhắc");
    expect(JSON.stringify(r.body)).not.toContain("boom");
  });
});

describe("GET /api/internal/debt-due-soon - đường chạy thuận lợi", () => {
  it("hoá đơn còn 7 ngày -> 1 nhóm D7 đủ thông tin người nhận / CC / chữ ký / số tiền", async () => {
    db.invoices = [inv({ originalAmount: dec(1_000_000), paidAmount: dec(0) })];
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.daysBefore).toBe(7);
    expect(body.groups).toHaveLength(1);
    const g = body.groups[0];
    expect(g).toMatchObject({
      customerCode: "KH1",
      customerName: "Công ty KH1 (chuẩn)", // lấy theo bản ghi Customer
      contactPerson: "Chị Lan",
      milestone: "D7",
      to: ["ketoan@kh1.com"],
      cc: ["tung.thuc@gmail.com"], // notifyEmail được ưu tiên hơn email đăng nhập
      salesEmployeeName: "Ngô Thanh Tùng",
      salesEmployeePhone: "0900000001",
      totalRemaining: 1_000_000,
    });
    expect(g.invoices).toHaveLength(1);
    expect(g.invoices[0]).toMatchObject({ invoiceNumber: "HD1", remainingAmount: 1_000_000 });
    expect(new Date(g.invoices[0].dueDate).getTime()).toBe(day(7).getTime());
  });

  it("ngày đầu tiên quá hạn -> nhóm OVERDUE", async () => {
    db.invoices = [inv({ dueDate: day(-1) })];
    const { body } = await call();
    expect(body.groups.map((g: { milestone: string }) => g.milestone)).toEqual(["OVERDUE"]);
  });

  it("Decimal của Prisma được Number() trước khi tính; trả một phần -> gửi SỐ CÒN PHẢI THU", async () => {
    db.invoices = [inv({ originalAmount: dec(1_000_000), paidAmount: dec(400_000) })];
    const g = (await call()).body.groups[0];
    expect(g.invoices[0].remainingAmount).toBe(600_000);
    expect(g.totalRemaining).toBe(600_000);
  });

  it("truy vấn hoá đơn theo NVKD thoả điều kiện PKD1 (không hardcode mã), KHÔNG còn lọc theo source", async () => {
    db.invoices = [inv()];
    await call();
    const firstWhere = vi.mocked(prisma.debtInvoice.findMany).mock.calls[0][0]!.where;
    expect(firstWhere).toMatchObject({
      salesEmployee: { active: true, amisEmployeeCode: { not: null }, includeInSalesStats: true },
    });
    expect(firstWhere).not.toHaveProperty("source");
  });

  it("đợt 3 mục A.2: truy vấn hoá đơn chính có orderBy cố định (customerCode, id) — giữ thứ tự ổn định giữa các lượt chạy để giảm deadlock khi ghi log song song", async () => {
    db.invoices = [inv()];
    await call();
    const firstCallArgs = vi.mocked(prisma.debtInvoice.findMany).mock.calls[0][0]!;
    expect(firstCallArgs.orderBy).toEqual([{ customerCode: "asc" }, { id: "asc" }]);
  });
});

describe("GET /api/internal/debt-due-soon - đúng mốc, đúng đối tượng", () => {
  it("-8/-6 ngày, +2 ngày (không khớp D7/D0/bội số 7 quá hạn) -> không nhóm nào", async () => {
    db.invoices = [inv({ dueDate: day(8) }), inv({ dueDate: day(6) }), inv({ dueDate: day(-2) })];
    expect((await call()).body.groups).toEqual([]);
  });

  it("đúng ngày hạn (overdueDays === 0) -> mốc D0", async () => {
    db.invoices = [inv({ dueDate: day(0) })];
    expect((await call()).body.groups.map((g: { milestone: string }) => g.milestone)).toEqual(["D0"]);
  });

  it("quá hạn đúng bội số 7 ngày (1, 8, 15) -> OVERDUE với occurrence tăng dần; 7/14 (không phải mốc) -> không nhóm", async () => {
    db.invoices = [inv({ dueDate: day(-1) }), inv({ dueDate: day(-7) }), inv({ dueDate: day(-8) }), inv({ dueDate: day(-14) }), inv({ dueDate: day(-15) })];
    const { groups } = (await call()).body;
    // 2 khách cùng KH1 nhưng occurrence khác nhau -> 3 nhóm riêng: lần 1 (day -1), lần 2 (day -8), lần 3 (day -15).
    expect(groups.map((g: { occurrence: number }) => g.occurrence).sort()).toEqual([1, 2, 3]);
  });

  it("đã trả hết thì không gửi dù đúng mốc", async () => {
    db.invoices = [inv({ originalAmount: dec(500), paidAmount: dec(500) })];
    expect((await call()).body.groups).toEqual([]);
  });

  it("hoá đơn nguồn BASELINE cũng được nhắc (không còn giới hạn theo source)", async () => {
    db.invoices = [inv({ source: "BASELINE" })];
    const { body } = await call();
    expect(body.groups).toHaveLength(1);
    expect(body.skippedNoEmailCount).toBe(0);
  });

  it("1 khách nhiều hoá đơn cùng mốc -> ĐÚNG 1 nhóm (1 thư), cộng dồn tiền", async () => {
    db.invoices = [inv({ originalAmount: dec(100) }), inv({ originalAmount: dec(250), paidAmount: dec(50) }), inv({ originalAmount: dec(1) })];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1);
    expect(groups[0].invoices).toHaveLength(3);
    expect(groups[0].totalRemaining).toBe(100 + 200 + 1);
  });

  it("cùng khách có 2 mốc trong 1 ngày -> 2 nhóm (2 thư riêng)", async () => {
    db.invoices = [inv({ dueDate: day(7) }), inv({ dueDate: day(-1) })];
    const { groups } = (await call()).body;
    expect(groups.map((g: { milestone: string }) => g.milestone).sort()).toEqual(["D7", "OVERDUE"]);
    expect(groups.every((g: { invoices: unknown[] }) => g.invoices.length === 1)).toBe(true);
  });

  it("nhiều khách -> mỗi khách 1 nhóm", async () => {
    db.customers = [cust(), cust({ customerCode: "KH2", email: "b@kh2.com" })];
    db.invoices = [inv(), inv({ customerCode: "KH2" })];
    const { groups } = (await call()).body;
    expect(groups.map((g: { customerCode: string }) => g.customerCode).sort()).toEqual(["KH1", "KH2"]);
  });

  it("lọc theo customerCode (nút Gửi ngay) chỉ trả khách đó, so khớp qua chuẩn hoá mã", async () => {
    db.customers = [cust(), cust({ customerCode: "KH2", email: "b@kh2.com" })];
    db.invoices = [inv(), inv({ customerCode: "KH2" })];
    const r = await call("?customerCode=%20kh2%20");
    expect(r.body.groups.map((g: { customerCode: string }) => g.customerCode)).toEqual(["KH2"]);
  });

  it("lọc theo milestone chỉ trả đúng mốc đó", async () => {
    db.invoices = [inv({ dueDate: day(7) }), inv({ dueDate: day(-1) })];
    const r = await call("?milestone=OVERDUE");
    expect(r.body.groups.map((g: { milestone: string }) => g.milestone)).toEqual(["OVERDUE"]);
  });

  it("lọc theo milestone=D0 chỉ trả đúng mốc đó", async () => {
    db.invoices = [inv({ dueDate: day(7) }), inv({ dueDate: day(0) })];
    const r = await call("?milestone=D0");
    expect(r.body.groups.map((g: { milestone: string }) => g.milestone)).toEqual(["D0"]);
  });

  it("ví dụ 2 thư quá hạn cùng ngày cho 1 khách: HĐ-A (quá hạn 1, lần 1) + HĐ-C (lần 1) chung 1 thư; HĐ-B (quá hạn 8, lần 2) thư riêng", async () => {
    const a = inv({ dueDate: day(-1), invoiceNumber: "HD-A" });
    const b = inv({ dueDate: day(-8), invoiceNumber: "HD-B" });
    const c = inv({ dueDate: day(-1), invoiceNumber: "HD-C" });
    db.invoices = [a, b, c];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(2);
    const g1 = groups.find((g: { occurrence: number }) => g.occurrence === 1);
    const g2 = groups.find((g: { occurrence: number }) => g.occurrence === 2);
    expect(g1.invoices.map((i: { invoiceNumber: string }) => i.invoiceNumber).sort()).toEqual(["HD-A", "HD-C"]);
    expect(g2.invoices.map((i: { invoiceNumber: string }) => i.invoiceNumber)).toEqual(["HD-B"]);
  });
});

describe("GET /api/internal/debt-due-soon - chống gửi trùng (đối chiếu DebtReminderLog)", () => {
  it("đã có log đúng (hoá đơn, mốc, dueDate, occurrence) -> không trả lại", async () => {
    const a = inv();
    db.invoices = [a];
    db.logs = [{ invoiceId: a.id, milestone: "D7", dueDate: a.dueDate!, occurrence: 1 }];
    expect((await call()).body.groups).toEqual([]);
  });

  it("dueDate đã đổi (đổi payment term) -> log cũ có dueDate khác KHÔNG chặn, được gửi lại", async () => {
    const a = inv({ dueDate: day(7) });
    db.invoices = [a];
    db.logs = [{ invoiceId: a.id, milestone: "D7", dueDate: day(-20), occurrence: 1 }];
    expect((await call()).body.groups).toHaveLength(1);
  });

  it("log của mốc khác cùng dueDate không chặn mốc này", async () => {
    const a = inv({ dueDate: day(-1) });
    db.invoices = [a];
    db.logs = [{ invoiceId: a.id, milestone: "D7", dueDate: a.dueDate!, occurrence: 1 }];
    expect((await call()).body.groups).toHaveLength(1);
  });

  it("nhóm có hoá đơn đã gửi + hoá đơn mới -> chỉ gom hoá đơn CHƯA gửi", async () => {
    const sent = inv();
    const fresh = inv();
    db.invoices = [sent, fresh];
    db.logs = [{ invoiceId: sent.id, milestone: "D7", dueDate: sent.dueDate!, occurrence: 1 }];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1);
    expect(groups[0].invoices.map((i: { id: string }) => i.id)).toEqual([fresh.id]);
  });

  it("hoá đơn quá hạn 8 ngày đã có log occurrence 1 (lần trước, dueDate cũ hoặc khác) -> vẫn được trả về ở occurrence 2 (không bị coi là trùng)", async () => {
    const a = inv({ dueDate: day(-8) });
    db.invoices = [a];
    db.logs = [{ invoiceId: a.id, milestone: "OVERDUE", dueDate: a.dueDate!, occurrence: 1 }];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ milestone: "OVERDUE", occurrence: 2 });
  });

  it("log đúng occurrence hiện tại -> chặn đúng, không trả lại", async () => {
    const a = inv({ dueDate: day(-8) });
    db.invoices = [a];
    db.logs = [{ invoiceId: a.id, milestone: "OVERDUE", dueDate: a.dueDate!, occurrence: 2 }];
    expect((await call()).body.groups).toEqual([]);
  });
});

describe("GET /api/internal/debt-due-soon - phạm vi PKD1 (lọc CHẶT)", () => {
  const pkd1Breakers: [string, Partial<Emp>][] = [
    ["NVKD đã nghỉ (active=false)", { active: false }],
    ["NVKD không có amisEmployeeCode", { amisEmployeeCode: null }],
    ["NVKD includeInSalesStats=false", { includeInSalesStats: false }],
  ];

  it.each(pkd1Breakers)("%s -> KHÔNG gửi, chỉ đếm vào skippedNotPkd1", async (_name, over) => {
    db.invoices = [inv({ salesEmployee: emp(over) })];
    const { body } = await call();
    expect(body.groups).toEqual([]);
    expect(body.skippedNotPkd1).toEqual(["KH1"]);
    expect(body.skippedNotPkd1Count).toBe(1);
  });

  it("hoá đơn chưa gán NVKD (salesEmployeeId = null) -> KHÔNG gửi, đếm vào skippedNotPkd1", async () => {
    db.invoices = [inv({ salesEmployee: null })];
    const { body } = await call();
    expect(body.groups).toEqual([]);
    expect(body.skippedNotPkd1).toEqual(["KH1"]);
  });

  it("phòng khác lẫn vào cùng khách: hoá đơn PKD1 vẫn gửi, hoá đơn ngoài PKD1 không lọt vào thư", async () => {
    const mine = inv();
    const other = inv({ salesEmployee: emp({ name: "Người phòng khác", amisEmployeeCode: null }) });
    db.invoices = [mine, other];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1);
    expect(groups[0].invoices.map((i: { id: string }) => i.id)).toEqual([mine.id]);
  });

  it("hoá đơn ngoài PKD1 nhưng KHÔNG tới mốc -> không bị đếm vào skippedNotPkd1", async () => {
    db.invoices = [inv({ salesEmployee: null, dueDate: day(3) })];
    expect((await call()).body.skippedNotPkd1Count).toBe(0);
  });

  it("customerCode filter cũng áp cho skippedNotPkd1", async () => {
    db.invoices = [inv({ customerCode: "KH9", salesEmployee: null })];
    expect((await call("?customerCode=KH1")).body.skippedNotPkd1Count).toBe(0);
  });
});

describe("GET /api/internal/debt-due-soon - email khách", () => {
  it("khách chưa có email -> skippedNoEmail, không thành nhóm", async () => {
    db.customers = [cust({ email: null })];
    db.invoices = [inv()];
    const { body } = await call();
    expect(body.groups).toEqual([]);
    expect(body.skippedNoEmail).toEqual(["KH1"]);
    expect(body.skippedNoEmailCount).toBe(1);
  });

  it("mã hoá đơn không khớp bản ghi Customer nào -> coi như thiếu email", async () => {
    db.customers = [cust({ customerCode: "KHAC" })];
    db.invoices = [inv()];
    const { body } = await call();
    expect(body.groups).toEqual([]);
    expect(body.skippedNoEmail).toEqual(["KH1"]);
  });

  it("nhiều địa chỉ -> gửi HẾT; 1 địa chỉ sai bị lọc bỏ, vẫn gửi các địa chỉ đúng", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    db.customers = [cust({ email: "a@kh1.com; sai-dia-chi, b@kh1.com" })];
    db.invoices = [inv()];
    const { groups } = (await call()).body;
    expect(groups[0].to).toEqual(["a@kh1.com", "b@kh1.com"]);
  });

  it("toàn địa chỉ sai -> coi như thiếu email, KHÔNG gửi", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    db.customers = [cust({ email: "abc; xyz@" })];
    db.invoices = [inv()];
    const { body } = await call();
    expect(body.groups).toEqual([]);
    expect(body.skippedNoEmail).toEqual(["KH1"]);
  });

  it("mã khách lệch hoa/thường, tiền tố 'V.', dấu chấm cuối vẫn khớp qua normalizeCustomerCode", async () => {
    db.customers = [cust({ customerCode: "baobisonglam", email: "x@bb.com" })];
    db.invoices = [inv({ customerCode: "V.BAOBISONGLAM." })];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1);
    expect(groups[0].to).toEqual(["x@bb.com"]);
  });

  it("2 hoá đơn cùng khách nhưng mã ghi lệch nhau (V.ABC / ABC) -> vẫn chung 1 nhóm", async () => {
    db.customers = [cust({ customerCode: "ABC" })];
    db.invoices = [inv({ customerCode: "V.ABC" }), inv({ customerCode: "ABC" })];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1);
    expect(groups[0].invoices).toHaveLength(2);
  });

  it("danh sách mẫu bị cắt 20 nhưng bộ đếm vẫn đầy đủ", async () => {
    db.customers = [];
    db.invoices = Array.from({ length: 25 }, (_, i) => inv({ customerCode: `K${i}` }));
    const { body } = await call();
    expect(body.skippedNoEmail).toHaveLength(20);
    expect(body.skippedNoEmailCount).toBe(25);
  });
});

describe("GET /api/internal/debt-due-soon - CC nhân viên kinh doanh", () => {
  const ccOf = async () => (await call()).body.groups[0].cc;

  it("notifyEmail trống/toàn khoảng trắng -> KHÔNG fallback sang email đăng nhập (cc rỗng)", async () => {
    db.invoices = [inv({ salesEmployee: emp({ notifyEmail: "  ", email: "tung@hoanggia.local" }) })];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1);
    expect(groups[0].cc).toEqual([]);
  });

  it("NVKD không có email nào -> cc rỗng nhưng VẪN có nhóm gửi khách", async () => {
    db.invoices = [inv({ salesEmployee: emp({ notifyEmail: null, email: null }) })];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1);
    expect(groups[0].cc).toEqual([]);
  });

  it("địa chỉ CC sai định dạng bị bỏ (không làm hỏng cả thư)", async () => {
    db.invoices = [inv({ salesEmployee: emp({ notifyEmail: "khong-phai-email", email: null }) })];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1);
    expect(groups[0].cc).toEqual([]);
  });

  it("nhóm nhiều NVKD -> chỉ 1 thư, vẫn gộp đủ hoá đơn (CC/chữ ký theo hoá đơn đầu tiên)", async () => {
    const tung = inv();
    const dung = inv({ salesEmployee: emp({ name: "Phạm Thị Dung", notifyEmail: "dung@gmail.com", amisEmployeeCode: "PHAMDUNG" }) });
    db.invoices = [tung, dung];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1);
    expect(groups[0].invoices).toHaveLength(2);
    expect(groups[0].salesEmployeeName).toBe("Ngô Thanh Tùng");
  });
});

describe("GET /api/internal/debt-due-soon - displayOccurrence (đợt 3, mục E: override nợ cũ)", () => {
  it("khách override 3, hoá đơn quá hạn 8 ngày (occurrence 2), CHƯA có log OVERDUE nào -> displayOccurrence = 4", async () => {
    db.customers = [cust({ manualOverdueReminderBase: 3 })];
    db.invoices = [inv({ dueDate: day(-8), source: "BASELINE" })];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ occurrence: 2, displayOccurrence: 4 });
  });

  it("khách override 3 nhưng hoá đơn MỚI (NEW_INVOICE) quá hạn lần đầu -> displayOccurrence = occurrence = 1, KHÔNG phải 4", async () => {
    db.customers = [cust({ manualOverdueReminderBase: 3 })];
    db.invoices = [inv({ dueDate: day(-1), source: "NEW_INVOICE" })];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ occurrence: 1, displayOccurrence: 1 });
  });

  it("override 3, 1 thư gồm hoá đơn nợ cũ (BASELINE) + hoá đơn MỚI cùng lịch -> lấy MIN = số theo lịch của hoá đơn mới", async () => {
    db.customers = [cust({ manualOverdueReminderBase: 3 })];
    db.invoices = [inv({ dueDate: day(-8), source: "BASELINE" }), inv({ dueDate: day(-8), source: "NEW_INVOICE" })];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1);
    expect(groups[0].invoices).toHaveLength(2);
    // BASELINE: 3 + 0 + 1 = 4; NEW_INVOICE: occurrence lịch = 2 -> min = 2 (không in số lớn hơn sự thật).
    expect(groups[0]).toMatchObject({ occurrence: 2, displayOccurrence: 2 });
  });

  it("cùng khách, đã có 1 log OVERDUE (bất kỳ dueDate/occurrence nào) cho đúng hoá đơn đó -> displayOccurrence = 5", async () => {
    db.customers = [cust({ manualOverdueReminderBase: 3 })];
    const a = inv({ dueDate: day(-8), source: "BASELINE" });
    db.invoices = [a];
    db.logs = [{ invoiceId: a.id, milestone: "OVERDUE", dueDate: day(-1), occurrence: 1 }];
    const { groups } = (await call()).body;
    expect(groups[0]).toMatchObject({ occurrence: 2, displayOccurrence: 5 });
  });

  it("khách KHÔNG override -> displayOccurrence = occurrence (không đổi hành vi cũ)", async () => {
    db.customers = [cust({ manualOverdueReminderBase: null })];
    db.invoices = [inv({ dueDate: day(-8) })];
    const { groups } = (await call()).body;
    expect(groups[0]).toMatchObject({ occurrence: 2, displayOccurrence: 2 });
  });

  it("override = 0, chưa có log -> displayOccurrence = 1 (GIẢ ĐỊNH 14: 0 nghĩa là 'chỉ đếm thư hệ thống gửi')", async () => {
    db.customers = [cust({ manualOverdueReminderBase: 0 })];
    db.invoices = [inv({ dueDate: day(-1), source: "BASELINE" })];
    const { groups } = (await call()).body;
    expect(groups[0]).toMatchObject({ occurrence: 1, displayOccurrence: 1 });
  });

  it("1 thư gồm 2 hoá đơn có số log OVERDUE trước đó LỆCH NHAU (0 và 3) -> lấy MIN (GIẢ ĐỊNH 13)", async () => {
    db.customers = [cust({ manualOverdueReminderBase: 2 })];
    const a = inv({ dueDate: day(-8), source: "BASELINE" });
    const b = inv({ dueDate: day(-8), source: "BASELINE" });
    db.invoices = [a, b];
    db.logs = [
      { invoiceId: b.id, milestone: "OVERDUE", dueDate: day(-1), occurrence: 1 },
      { invoiceId: b.id, milestone: "OVERDUE", dueDate: day(-8), occurrence: 1 },
      { invoiceId: b.id, milestone: "OVERDUE", dueDate: day(-15), occurrence: 1 },
    ];
    const { groups } = (await call()).body;
    expect(groups).toHaveLength(1); // cùng khách, cùng occurrence -> 1 nhóm
    expect(groups[0].invoices).toHaveLength(2);
    // min(0 log của a, 3 log của b) = 0 -> displayOccurrence = 2 + 0 + 1 = 3.
    expect(groups[0].displayOccurrence).toBe(3);
  });

  it("khách có override nhưng mốc D7/D0 -> displayOccurrence LUÔN bằng 1 (override chỉ áp cho OVERDUE)", async () => {
    db.customers = [cust({ manualOverdueReminderBase: 5 })];
    db.invoices = [inv({ dueDate: day(7) }), inv({ dueDate: day(0) })];
    const { groups } = (await call()).body;
    expect(groups.map((g: { milestone: string; displayOccurrence: number }) => [g.milestone, g.displayOccurrence]).sort()).toEqual([
      ["D0", 1],
      ["D7", 1],
    ]);
  });

  it("khách có override -> occurrence (lần theo lịch) và khoá chống trùng KHÔNG đổi", async () => {
    db.customers = [cust({ manualOverdueReminderBase: 3 })];
    const a = inv({ dueDate: day(-8) });
    db.invoices = [a];
    // Log đã có ĐÚNG khoá chống trùng (invoiceId, milestone, dueDate, occurrence) -> vẫn phải bị chặn
    // dù khách có override (override chỉ đổi số IN RA, không đổi khoá chống trùng/lịch gửi).
    db.logs = [{ invoiceId: a.id, milestone: "OVERDUE", dueDate: a.dueDate!, occurrence: 2 }];
    expect((await call()).body.groups).toEqual([]);
  });
});

describe("GET /api/internal/debt-due-soon - hoá đơn thiếu hạn thanh toán", () => {
  it("dueDate = null: KHÔNG vào groups, gom theo NVKD vào missingDueDate", async () => {
    db.invoices = [inv({ dueDate: null, invoiceNumber: "A" }), inv({ dueDate: null, invoiceNumber: null }), inv({ dueDate: null, salesEmployee: emp({ name: "Phạm Thị Dung" }), salesEmployeeId: "u-dung" })];
    const { body } = await call();
    expect(body.groups).toEqual([]);
    expect(body.missingDueDate).toHaveLength(2);
    const tung = body.missingDueDate.find((m: { salesEmployeeId: string }) => m.salesEmployeeId === "u-tung");
    expect(tung.invoices).toHaveLength(2);
    expect(tung.salesEmployeeName).toBe("Ngô Thanh Tùng");
  });

  it("thiếu hạn nhưng đã trả hết, hoặc NVKD ngoài PKD1 / chưa gán -> không thông báo", async () => {
    db.invoices = [
      inv({ dueDate: null, originalAmount: dec(10), paidAmount: dec(10) }),
      inv({ dueDate: null, salesEmployee: emp({ active: false }) }),
      inv({ dueDate: null, salesEmployee: null }),
    ];
    expect((await call()).body.missingDueDate).toEqual([]);
  });

  it("thiếu hạn nhưng nguồn BASELINE vẫn được thông báo (không còn lọc theo source)", async () => {
    db.invoices = [inv({ dueDate: null, source: "BASELINE" })];
    expect((await call()).body.missingDueDate).toHaveLength(1);
  });
});
