import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as XLSX from "xlsx";

// Test HÀNH VI của runDebtDueReminder với Prisma/SMTP/fetch giả — KHÔNG gửi email thật, KHÔNG chạm DB.
// Bảng DebtReminderLog giả mô phỏng unique (invoiceId, milestone, dueDate) + skipDuplicates của Postgres.
// Chạy: cd apps/worker && npx vitest run

const h = vi.hoisted(() => {
  // $transaction giả mô phỏng MUTEX: mỗi callback chỉ chạy sau khi callback của lượt TRƯỚC đã xong
  // (resolve HOẶC reject) — mô phỏng việc dòng chưa commit của 1 transaction Postgres chặn transaction
  // khác cho tới khi commit/rollback xong. `tx` đưa vào callback chỉ có đúng `debtReminderLog.createMany`
  // (đủ dùng cho code hiện tại). `chain` được reset ở `beforeEach` qua `resetTransactionChain()`.
  let chain: Promise<unknown> = Promise.resolve();
  const state = {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    notifFindFirst: vi.fn(),
    notifCreate: vi.fn(),
    sendEmail: vi.fn(),
    isEmailConfigured: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    order: [] as string[],
    store: new Set<string>(),
    transaction: vi.fn((cb: (tx: unknown) => Promise<unknown>) => {
      const tx = { debtReminderLog: { createMany: state.createMany } };
      const run = chain.then(() => cb(tx));
      chain = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    }),
    resetTransactionChain: () => {
      chain = Promise.resolve();
    },
  };
  return state;
});

vi.mock("@hoanggia/db", () => ({
  prisma: {
    debtReminderLog: { createMany: h.createMany, deleteMany: h.deleteMany },
    notification: { findFirst: h.notifFindFirst, create: h.notifCreate },
    $transaction: h.transaction,
  },
}));
vi.mock("../src/email", () => ({ sendEmail: h.sendEmail, isEmailConfigured: h.isEmailConfigured }));
vi.mock("../src/logger", () => ({ logger: { info: h.info, warn: h.warn, error: h.error } }));

const key = (k: { invoiceId: string; milestone: string; dueDate: Date; occurrence: number }) =>
  `${k.invoiceId}|${k.milestone}|${k.dueDate.getTime()}|${k.occurrence}`;
const fetchMock = vi.fn();

type Group = ReturnType<typeof group>;
const DUE = "2026-09-25T17:00:00.000Z"; // 26/09/2026 giờ VN
const DUE2 = "2026-10-09T17:00:00.000Z";
function group(over: Record<string, unknown> = {}) {
  // displayOccurrence mặc định BẰNG occurrence được truyền vào (khách không override — GIẢ ĐỊNH 11).
  const occurrence = (over.occurrence as number | undefined) ?? 1;
  return {
    customerCode: "KH1",
    customerName: "Công ty A",
    contactPerson: "Chị Lan",
    milestone: "D7" as "D7" | "D0" | "OVERDUE",
    occurrence,
    displayOccurrence: occurrence,
    dueDate: DUE,
    daysFromDue: -7,
    to: ["a@x.com", "b@y.com"],
    cc: ["tung@gmail.com"],
    salesEmployeeName: "Ngô Thanh Tùng",
    salesEmployeePhone: "0900000001",
    salesEmployeeEmail: "tung@gmail.com",
    totalRemaining: 300,
    invoices: [
      { id: "i1", invoiceNumber: "HD1", invoiceDate: "2026-08-26T17:00:00.000Z", dueDate: DUE, remainingAmount: 100 },
      { id: "i2", invoiceNumber: "HD2", invoiceDate: "2026-08-26T17:00:00.000Z", dueDate: DUE, remainingAmount: 200 },
    ],
    ...over,
  };
}
function payload(over: { groups?: Group[]; missingDueDate?: unknown[]; [k: string]: unknown } = {}) {
  return { skippedNoEmail: [], skippedNotPkd1: [], groups: [], missingDueDate: [], ...over };
}
function serve(body: unknown, delayMs = 0) {
  fetchMock.mockImplementation(async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
  });
}

async function load(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  const e = { INTERNAL_SYNC_TOKEN: "tok", DEBT_REMINDER_ENABLED: "true", ...env };
  for (const [k, v] of Object.entries(e)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return (await import("../src/notifications/debtDueReminder")).runDebtDueReminder;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.order.length = 0;
  h.store.clear();
  h.resetTransactionChain();
  h.isEmailConfigured.mockReturnValue(true);
  h.sendEmail.mockImplementation(async () => {
    h.order.push("sendEmail");
    return true;
  });
  h.createMany.mockImplementation(async ({ data }: { data: { invoiceId: string; milestone: string; dueDate: Date; occurrence: number }[] }) => {
    h.order.push("createMany");
    let count = 0;
    for (const d of data) if (!h.store.has(key(d))) (h.store.add(key(d)), count++);
    return { count };
  });
  h.deleteMany.mockImplementation(async ({ where }: { where: { OR: { invoiceId: string; milestone: string; dueDate: Date; occurrence: number }[] } }) => {
    h.order.push("deleteMany");
    for (const k of where.OR) h.store.delete(key(k));
    return { count: where.OR.length };
  });
  h.notifFindFirst.mockResolvedValue(null);
  h.notifCreate.mockResolvedValue({});
  vi.stubGlobal("fetch", fetchMock);
  serve(payload());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("runDebtDueReminder - các cổng chặn (không gửi, không ghi log, không throw)", () => {
  const untouched = () => {
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.createMany).not.toHaveBeenCalled();
    expect(h.notifCreate).not.toHaveBeenCalled();
  };

  it("thiếu INTERNAL_SYNC_TOKEN -> trả 0 kèm lý do", async () => {
    const run = await load({ INTERNAL_SYNC_TOKEN: undefined });
    const r = await run();
    expect(r).toMatchObject({ checked: 0, sent: 0, skippedNoEmail: 0, notifiedMissingDueDate: 0 });
    expect(r.skippedReason).toMatch(/INTERNAL_SYNC_TOKEN/);
    untouched();
  });

  it("DEBT_REMINDER_ENABLED chưa đặt -> tắt, báo lý do", async () => {
    const run = await load({ DEBT_REMINDER_ENABLED: undefined });
    const r = await run();
    expect(r.sent).toBe(0);
    expect(r.skippedReason).toMatch(/TẮT/);
    untouched();
  });

  it("DEBT_REMINDER_ENABLED=false -> tắt", async () => {
    const run = await load({ DEBT_REMINDER_ENABLED: "false" });
    expect((await run()).skippedReason).toMatch(/TẮT/);
    untouched();
  });

  it("chưa cấu hình SMTP -> không gửi, báo lý do", async () => {
    h.isEmailConfigured.mockReturnValue(false);
    const run = await load();
    const r = await run();
    expect(r.skippedReason).toMatch(/SMTP/);
    untouched();
  });
});

describe("runDebtDueReminder - đường chạy thuận lợi", () => {
  it("1 nhóm 2 hoá đơn -> ĐÚNG 1 thư (to hết mọi địa chỉ, CC NVKD, đính kèm .xlsx) + 2 dòng log", async () => {
    serve(payload({ groups: [group()] }));
    const run = await load();
    const r = await run();
    expect(r).toEqual({ checked: 1, sent: 1, skippedNoEmail: 0, notifiedMissingDueDate: 0 });

    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html, opts] = h.sendEmail.mock.calls[0];
    expect(to).toEqual(["a@x.com", "b@y.com"]);
    expect(subject).toBe("V/v: Thông báo hóa đơn sắp đến hạn thanh toán");
    expect(html).toContain("còn 7 ngày");
    expect(opts.cc).toEqual(["tung@gmail.com"]);
    expect(opts.attachments).toHaveLength(1);
    expect(opts.attachments[0].filename).toMatch(/^Bang-ke-cong-no-KH1-D7-\d{8}\.xlsx$/);
    const rows = XLSX.utils.sheet_to_json(XLSX.read(opts.attachments[0].content, { type: "buffer" }).Sheets["Bang ke cong no"], { header: 1 }) as unknown[][];
    expect(rows).toHaveLength(4); // header + 2 hoá đơn + tổng

    // 1 dòng log / hoá đơn, ghi rõ người nhận + người kích hoạt.
    // (ghi từng dòng — mỗi lần gọi createMany chứa đúng 1 dòng log)
    expect(h.createMany).toHaveBeenCalledTimes(2);
    const arg = h.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data).toHaveLength(1);
    expect(arg.data[0]).toMatchObject({
      invoiceId: "i1",
      milestone: "D7",
      recipients: "a@x.com, b@y.com",
      ccRecipients: "tung@gmail.com",
      triggeredBy: "CRON",
    });
    expect(arg.data[0].dueDate).toEqual(new Date(DUE));
    expect(h.createMany.mock.calls[1][0].data[0].invoiceId).toBe("i2");
  });

  it("THỨ TỰ chống trùng: ghi log TRƯỚC khi gửi thư", async () => {
    serve(payload({ groups: [group()] }));
    await (await load())();
    expect(h.order).toEqual(["createMany", "createMany", "sendEmail"]);
  });

  it("mốc D0 dùng câu chữ đúng ngày đến hạn", async () => {
    serve(payload({ groups: [group({ milestone: "D0", daysFromDue: 0 })] }));
    await (await load())();
    expect(h.sendEmail.mock.calls[0][1]).toBe("V/v: Nhắc thanh toán hóa đơn đến hạn");
    expect(h.sendEmail.mock.calls[0][2]).toContain("hôm nay");
  });

  it("mốc OVERDUE dùng câu chữ quá hạn + đúng lần nhắc", async () => {
    serve(payload({ groups: [group({ milestone: "OVERDUE", daysFromDue: 1, occurrence: 1 })] }));
    await (await load())();
    expect(h.sendEmail.mock.calls[0][1]).toBe("V/v: Nhắc thanh toán công nợ quá hạn (lần 1)");
    expect(h.sendEmail.mock.calls[0][2]).toContain("đã quá hạn thanh toán");
  });

  it("cùng khách 2 mốc trong 1 ngày -> 2 thư riêng, nội dung khác nhau", async () => {
    serve(
      payload({
        groups: [
          group(),
          group({
            milestone: "OVERDUE",
            daysFromDue: 1,
            invoices: [{ id: "i9", invoiceNumber: "HD9", invoiceDate: null, dueDate: DUE, remainingAmount: 5 }],
            totalRemaining: 5,
          }),
        ],
      })
    );
    const r = await (await load())();
    expect(r).toMatchObject({ checked: 2, sent: 2 });
    expect(h.sendEmail).toHaveBeenCalledTimes(2);
    expect(h.sendEmail.mock.calls[0][2]).not.toBe(h.sendEmail.mock.calls[1][2]);
  });

  it("truyền customerCode/milestone lên query, kèm x-internal-token; triggeredBy = người bấm 'Gửi ngay'", async () => {
    serve(payload({ groups: [group()] }));
    await (await load())({ customerCode: "KH1", milestone: "D7", triggeredBy: "u-tung" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/internal\/debt-due-soon\?customerCode=KH1&milestone=D7$/);
    expect(init.headers["x-internal-token"]).toBe("tok");
    expect(h.createMany.mock.calls[0][0].data[0].triggeredBy).toBe("u-tung");
  });

  it("không có tham số -> không có query string", async () => {
    await (await load())();
    expect(fetchMock.mock.calls[0][0]).toMatch(/debt-due-soon$/);
  });

  it("tên file đính kèm được làm sạch từ mã khách có ký tự lạ", async () => {
    serve(payload({ groups: [group({ customerCode: "V.A/B C" })] }));
    await (await load())();
    expect(h.sendEmail.mock.calls[0][3].attachments[0].filename).toMatch(/^Bang-ke-cong-no-V\.A_B_C-D7-\d{8}\.xlsx$/);
  });

  it("khách chưa có email: đếm theo skippedNoEmailCount (không phải độ dài mẫu bị cắt 20)", async () => {
    serve(payload({ skippedNoEmail: ["A", "B"], skippedNoEmailCount: 57 }));
    const r = await (await load())();
    expect(r.skippedNoEmail).toBe(57);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});

describe("runDebtDueReminder - KHÔNG GỬI TRÙNG (quan trọng nhất)", () => {
  it("chạy 2 lần liên tiếp -> chỉ 1 thư", async () => {
    serve(payload({ groups: [group()] }));
    const run = await load();
    const r1 = await run();
    const r2 = await run();
    expect(r1.sent).toBe(1);
    expect(r2.sent).toBe(0);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("lượt thứ 2 chạy sau khi lượt 1 đã ghi xong -> không gửi lại (KHÔNG phải test race thật — 2 lượt ở\n" +
    "     đây không thực sự đan xen ghi log, xem describe 'race thật' bên dưới cho ca đan xen thật sự)", async () => {
    serve(payload({ groups: [group()] }), 5); // cả hai đều lấy được cùng danh sách trước khi bên nào ghi log
    const run = await load();
    const [a, b] = await Promise.all([run(), run({ customerCode: "KH1", triggeredBy: "u-tung" })]);
    expect(a.sent + b.sent).toBe(1);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("tất cả bị skipDuplicates (count = 0) -> bỏ qua, không gửi, không xoá log của lượt khác", async () => {
    h.createMany.mockResolvedValue({ count: 0 });
    serve(payload({ groups: [group()] }));
    const r = await (await load())();
    expect(r.sent).toBe(0);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.deleteMany).not.toHaveBeenCalled();
  });

  it("đổi payment term làm dueDate đổi -> khoá mới, hoá đơn lọt lại mốc ĐƯỢC gửi lại", async () => {
    const run = await load();
    serve(payload({ groups: [group()] }));
    expect((await run()).sent).toBe(1);

    const moved = group({ invoices: group().invoices.map((i) => ({ ...i, dueDate: DUE2 })) });
    serve(payload({ groups: [moved] }));
    expect((await run()).sent).toBe(1);
    expect(h.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("gửi THẤT BẠI (SMTP sai) -> xoá log của chính nhóm đó, lần sau gửi lại được", async () => {
    serve(payload({ groups: [group()] }));
    const run = await load();
    h.sendEmail.mockImplementationOnce(async () => {
      h.order.push("sendEmail");
      return false;
    });
    const r1 = await run();
    expect(r1.sent).toBe(0);
    expect(h.deleteMany).toHaveBeenCalledTimes(1);
    const where = h.deleteMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { invoiceId: "i1", milestone: "D7", dueDate: new Date(DUE), occurrence: 1 },
      { invoiceId: "i2", milestone: "D7", dueDate: new Date(DUE), occurrence: 1 },
    ]);
    expect(h.store.size).toBe(0);
    expect(h.error).toHaveBeenCalled();

    const r2 = await run(); // SMTP đã sửa
    expect(r2.sent).toBe(1);
    expect(h.sendEmail).toHaveBeenCalledTimes(2);
    expect(h.store.size).toBe(2);
  });

  it("gửi THẤT BẠI chỉ xoá log do CHÍNH lượt này tạo, không xoá log của lượt song song đã gửi", async () => {
    // Lượt khác (cron) đã gửi + giữ log cho i1, i2; hoá đơn i3 mới lọt mốc nên lượt này (Gửi ngay) tạo i3 rồi gửi lỗi.
    h.store.add(`i1|D7|${new Date(DUE).getTime()}|1`);
    h.store.add(`i2|D7|${new Date(DUE).getTime()}|1`);
    const three = group({
      invoices: [...group().invoices, { id: "i3", invoiceNumber: "HD3", invoiceDate: null, dueDate: DUE, remainingAmount: 5 }],
    });
    serve(payload({ groups: [three] }));
    h.sendEmail.mockImplementationOnce(async () => false);
    const r = await (await load())();
    expect(r.sent).toBe(0);
    expect(h.deleteMany.mock.calls[0][0].where.OR).toEqual([{ invoiceId: "i3", milestone: "D7", dueDate: new Date(DUE), occurrence: 1 }]);
    // log i1, i2 của lượt kia còn nguyên -> hôm sau không gửi trùng i1, i2.
    expect(h.store.has(`i1|D7|${new Date(DUE).getTime()}|1`)).toBe(true);
    expect(h.store.has(`i2|D7|${new Date(DUE).getTime()}|1`)).toBe(true);
    expect(h.store.has(`i3|D7|${new Date(DUE).getTime()}|1`)).toBe(false);
  });

  it("gửi thành công thì log được GIỮ (không deleteMany)", async () => {
    serve(payload({ groups: [group()] }));
    await (await load())();
    expect(h.deleteMany).not.toHaveBeenCalled();
    expect(h.store.size).toBe(2);
  });

  it("cùng khách 2 nhóm OVERDUE khác occurrence (ví dụ HĐ-A lần 1 / HĐ-B lần 2) -> 2 thư riêng, 2 tên file khác nhau, log đúng occurrence từng nhóm", async () => {
    const g1 = group({
      milestone: "OVERDUE",
      daysFromDue: 1,
      occurrence: 1,
      invoices: [{ id: "iA", invoiceNumber: "HD-A", invoiceDate: null, dueDate: DUE, remainingAmount: 100 }],
      totalRemaining: 100,
    });
    const g2 = group({
      milestone: "OVERDUE",
      daysFromDue: 8,
      occurrence: 2,
      invoices: [{ id: "iB", invoiceNumber: "HD-B", invoiceDate: null, dueDate: DUE2, remainingAmount: 200 }],
      totalRemaining: 200,
    });
    serve(payload({ groups: [g1, g2] }));
    const r = await (await load())();
    expect(r.sent).toBe(2);
    expect(h.sendEmail).toHaveBeenCalledTimes(2);

    const files = h.sendEmail.mock.calls.map((c) => c[3].attachments[0].filename);
    expect(files.some((f: string) => /-OVERDUE-lan1-\d{8}\.xlsx$/.test(f))).toBe(true);
    expect(files.some((f: string) => /-OVERDUE-lan2-\d{8}\.xlsx$/.test(f))).toBe(true);

    const loggedOccurrences = h.createMany.mock.calls.map((c) => c[0].data[0].occurrence);
    expect(loggedOccurrences.sort()).toEqual([1, 2]);
  });
});

describe("runDebtDueReminder - khách có override displayOccurrence (đợt 3, mục E) — KHÔNG được lẫn với occurrence theo lịch", () => {
  it("occurrence 31 (lịch) / displayOccurrence 4 (override) -> tên file dùng '-lan4-', TUYỆT ĐỐI không chứa 'lan31' hay '31'", async () => {
    serve(payload({ groups: [group({ milestone: "OVERDUE", daysFromDue: 211, occurrence: 31, displayOccurrence: 4 })] }));
    await (await load())();
    const filename = h.sendEmail.mock.calls[0][3].attachments[0].filename;
    expect(filename).toMatch(/^Bang-ke-cong-no-KH1-OVERDUE-lan4-\d{8}\.xlsx$/);
    expect(filename).not.toContain("lan31");
    expect(filename).not.toContain("31");
  });

  it("occurrence 31 / displayOccurrence 4 -> log ghi displayOccurrence: 4 (không phải 31, không phải null)", async () => {
    serve(payload({ groups: [group({ milestone: "OVERDUE", daysFromDue: 211, occurrence: 31, displayOccurrence: 4 })] }));
    await (await load())();
    const rows = h.createMany.mock.calls.map((c) => c[0].data[0]);
    expect(rows.every((r) => r.occurrence === 31)).toBe(true);
    expect(rows.every((r) => r.displayOccurrence === 4)).toBe(true);
  });

  it("khách KHÔNG override (occurrence === displayOccurrence) -> log ghi displayOccurrence: null (đúng quy ước cột, không lưu số trùng occurrence)", async () => {
    serve(payload({ groups: [group({ milestone: "OVERDUE", daysFromDue: 1, occurrence: 1, displayOccurrence: 1 })] }));
    await (await load())();
    const rows = h.createMany.mock.calls.map((c) => c[0].data[0]);
    expect(rows.every((r) => r.displayOccurrence === null)).toBe(true);
  });

  it("2 nhóm OVERDUE cùng khách cùng ngày, CẢ HAI đều có override (displayOccurrence 4 và 5, occurrence theo lịch 31 và 32) -> 2 tên file khác nhau theo displayOccurrence, không theo occurrence", async () => {
    const g1 = group({
      milestone: "OVERDUE",
      daysFromDue: 211,
      occurrence: 31,
      displayOccurrence: 4,
      invoices: [{ id: "iA", invoiceNumber: "HD-A", invoiceDate: null, dueDate: DUE, remainingAmount: 100 }],
      totalRemaining: 100,
    });
    const g2 = group({
      milestone: "OVERDUE",
      daysFromDue: 218,
      occurrence: 32,
      displayOccurrence: 5,
      invoices: [{ id: "iB", invoiceNumber: "HD-B", invoiceDate: null, dueDate: DUE2, remainingAmount: 200 }],
      totalRemaining: 200,
    });
    serve(payload({ groups: [g1, g2] }));
    const r = await (await load())();
    expect(r.sent).toBe(2);
    const files = h.sendEmail.mock.calls.map((c) => c[3].attachments[0].filename);
    expect(files.some((f: string) => f.includes("-lan4-"))).toBe(true);
    expect(files.some((f: string) => f.includes("-lan5-"))).toBe(true);
    expect(files.some((f: string) => f.includes("lan31") || f.includes("lan32"))).toBe(false);
  });

  it("log info khi gửi: occurrence khác displayOccurrence -> in CẢ HAI số, đúng định dạng '(lần X, in \"lần Y\")'", async () => {
    serve(payload({ groups: [group({ milestone: "OVERDUE", daysFromDue: 211, occurrence: 31, displayOccurrence: 4 })] }));
    await (await load())();
    const infoMsg = h.info.mock.calls.map((c) => String(c[0])).find((m) => m.includes("đã gửi mốc"));
    expect(infoMsg).toContain('(lần 31, in "lần 4")');
  });

  it("log info khi KHÔNG override: chỉ in 1 số duy nhất, không có chữ 'in \"lần'", async () => {
    serve(payload({ groups: [group({ milestone: "OVERDUE", daysFromDue: 1, occurrence: 1, displayOccurrence: 1 })] }));
    await (await load())();
    const infoMsg = h.info.mock.calls.map((c) => String(c[0])).find((m) => m.includes("đã gửi mốc"));
    expect(infoMsg).toContain("(lần 1)");
    expect(infoMsg).not.toContain('in "lần');
  });

  it("override chỉ đổi số IN THƯ — khoá chống trùng (logKeys) vẫn dùng occurrence theo lịch, không dùng displayOccurrence", async () => {
    serve(payload({ groups: [group({ milestone: "OVERDUE", daysFromDue: 211, occurrence: 31, displayOccurrence: 4 })] }));
    const run = await load();
    const r1 = await run();
    expect(r1.sent).toBe(1);
    // Chạy lại với CÙNG occurrence=31 (dueDate/hoá đơn giống hệt) -> phải bị coi là ĐÃ GỬI (skip), vì
    // khoá chống trùng không phụ thuộc displayOccurrence.
    const r2 = await run();
    expect(r2.sent).toBe(0);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("runDebtDueReminder - race THẬT giữa 2 lượt chạy (ép đan xen ghi log, không dựa vào timing tự nhiên)", () => {
  it("2 lượt song song, lượt B ghi được i2 trước khi lượt A ghi xong i2 -> vẫn chỉ 1 thư (BẮT BUỘC đỏ nếu ghi log không bọc $transaction, xanh sau khi bọc)", async () => {
    serve(payload({ groups: [group()] }));
    const run = await load();

    // Ép đúng thứ tự đan xen mà reviewer mô tả khi KHÔNG có transaction:
    // A:i1 ghi được (idx 0, giữ lại lâu nhất) -> B:i1 bị skip (idx 1) -> B:i2 ghi được (idx 2)
    // -> B gửi thư xong hẳn -> mãi sau đó A:i2 mới được xử lý (idx 3) -> bị skip vì B đã ghi.
    // Nếu code ghi log KHÔNG bọc trong 1 transaction (gọi createMany trực tiếp, không qua tx), thì cả
    // A lẫn B đều có `created.length > 0` (A có i1, B có i2) nên CẢ HAI cùng gửi thư -> gửi trùng.
    // Nếu code bọc `$transaction` (mock ở trên là 1 mutex tuần tự), lượt gọi $transaction thứ 2 phải
    // CHỜ lượt thứ 1 xong hẳn (kể cả độ trễ giả lập dưới đây) rồi mới chạy -> khi đó thấy đủ cả 2 dòng
    // đã có, skip hết, không gửi thư lần 2.
    let callSeq = 0;
    h.createMany.mockImplementation(
      async ({ data }: { data: { invoiceId: string; milestone: string; dueDate: Date; occurrence: number }[] }) => {
        const idx = callSeq++;
        const d = data[0];
        const already = h.store.has(key(d));
        if (!already) h.store.add(key(d));
        // Cổng thủ công (KHÔNG dựa vào timing tự nhiên của Promise.all): lệnh ghi ĐẦU TIÊN bị giữ lại
        // lâu nhất để nhường chỗ cho các lệnh ghi sau hoàn tất trước.
        await new Promise((resolve) => setTimeout(resolve, idx === 0 ? 50 : 0));
        return { count: already ? 0 : 1 };
      }
    );

    const [a, b] = await Promise.all([run(), run({ customerCode: "KH1", triggeredBy: "u-tung" })]);
    expect(a.sent + b.sent).toBe(1);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("runDebtDueReminder - lỗi từng phần", () => {
  it("lỗi ở 1 khách không chặn các khách còn lại", async () => {
    serve(payload({ groups: [group({ customerCode: "LOI" }), group({ customerCode: "OK", invoices: [{ id: "i7", invoiceNumber: "X", invoiceDate: null, dueDate: DUE, remainingAmount: 1 }], totalRemaining: 1 })] }));
    h.createMany.mockRejectedValueOnce(new Error("db lỗi"));
    const r = await (await load())();
    expect(r).toMatchObject({ checked: 2, sent: 1 });
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.error).toHaveBeenCalled();
  });

  it("NVKD không có email -> cảnh báo nêu tên NVKD nhưng VẪN gửi cho khách (cc rỗng)", async () => {
    serve(payload({ groups: [group({ cc: [] })] }));
    const r = await (await load())();
    expect(r.sent).toBe(1);
    expect(h.sendEmail.mock.calls[0][3].cc).toEqual([]);
    expect(h.warn.mock.calls.some((c) => String(c[0]).includes("Ngô Thanh Tùng"))).toBe(true);
    expect(h.createMany.mock.calls[0][0].data[0].ccRecipients).toBeNull();
  });

  it("THẤT BẠI: internal API trả != 200 -> throw (index.ts đã có .catch), không gửi/ghi gì", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const run = await load();
    await expect(run()).rejects.toThrow("debt-due-soon trả về 500");
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it("THẤT BẠI: web không kết nối được -> throw", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect((await load())()).rejects.toThrow("ECONNREFUSED");
  });
});

describe("runDebtDueReminder - thông báo hoá đơn thiếu hạn thanh toán (1 lần / tuần / NVKD)", () => {
  const missing = (n = 2, userId = "u-tung") => ({
    salesEmployeeId: userId,
    salesEmployeeName: "Tùng",
    invoices: Array.from({ length: n }, (_, i) => ({ id: `m${i}`, customerName: `KH ${i}`, invoiceNumber: i === 1 ? null : `HD${i}` })),
  });

  it("chưa thông báo tuần này -> tạo Notification nội bộ, KHÔNG gửi email cho việc này", async () => {
    serve(payload({ missingDueDate: [missing()] }));
    const r = await (await load())();
    expect(r.notifiedMissingDueDate).toBe(1);
    expect(h.sendEmail).not.toHaveBeenCalled();
    const data = h.notifCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: "u-tung", type: "DEBT_DUE_DATE_MISSING", link: "/debt" });
    expect(data.title).toContain("2 hoá đơn");
    expect(data.message).toContain("KH 0 – HD0");
    expect(data.message).toContain("(không số HĐ)");
  });

  it("đã có thông báo trong tuần -> KHÔNG tạo thêm (không spam mỗi ngày)", async () => {
    h.notifFindFirst.mockResolvedValue({ id: "n1" });
    serve(payload({ missingDueDate: [missing()] }));
    const r = await (await load())();
    expect(r.notifiedMissingDueDate).toBe(0);
    expect(h.notifCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["Thứ 7 19/09/2026", new Date(2026, 8, 19, 8), new Date(2026, 8, 14)],
    ["Chủ nhật 20/09/2026 (vẫn thuộc tuần bắt đầu Thứ 2 14/09)", new Date(2026, 8, 20, 8), new Date(2026, 8, 14)],
    ["Thứ 2 21/09/2026 (đầu tuần mới)", new Date(2026, 8, 21, 8), new Date(2026, 8, 21)],
  ])("mốc tuần: %s", async (_label, now, monday) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now as Date);
    serve(payload({ missingDueDate: [missing()] }));
    await (await load())();
    const where = h.notifFindFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: "u-tung", type: "DEBT_DUE_DATE_MISSING" });
    expect(where.createdAt.gte.getTime()).toBe((monday as Date).getTime());
  });

  it("gộp nhiều hoá đơn vào 1 thông báo: tối đa 5 ví dụ + 'và N hoá đơn khác'", async () => {
    serve(payload({ missingDueDate: [missing(8)] }));
    await (await load())();
    const { message, title } = h.notifCreate.mock.calls[0][0].data;
    expect(title).toContain("8 hoá đơn");
    expect(message).toContain("KH 4");
    expect(message).not.toContain("KH 5");
    expect(message).toContain("và 3 hoá đơn khác");
  });

  it("mỗi NVKD 1 thông báo riêng, chỉ NVKD chưa được nhắc mới được tính", async () => {
    h.notifFindFirst.mockImplementation(async ({ where }: { where: { userId: string } }) => (where.userId === "u-dung" ? { id: "n" } : null));
    serve(payload({ missingDueDate: [missing(1, "u-tung"), missing(1, "u-dung")] }));
    const r = await (await load())();
    expect(r.notifiedMissingDueDate).toBe(1);
    expect(h.notifCreate.mock.calls.map((c) => c[0].data.userId)).toEqual(["u-tung"]);
  });

  it("chạy cho 1 khách ('Gửi ngay') -> bỏ qua bước thông báo thiếu hạn", async () => {
    serve(payload({ groups: [group()], missingDueDate: [missing()] }));
    const r = await (await load())({ customerCode: "KH1", milestone: "D7", triggeredBy: "u-tung" });
    expect(r.sent).toBe(1);
    expect(r.notifiedMissingDueDate).toBe(0);
    expect(h.notifFindFirst).not.toHaveBeenCalled();
    expect(h.notifCreate).not.toHaveBeenCalled();
  });

  it("thư khách và thông báo nội bộ độc lập: không có nhóm nào tới mốc vẫn thông báo được", async () => {
    serve(payload({ groups: [], missingDueDate: [missing()] }));
    const r = await (await load())();
    expect(r).toMatchObject({ checked: 0, sent: 0, notifiedMissingDueDate: 1 });
  });
});
