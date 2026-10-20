import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  users: vi.fn(),
  logs: vi.fn(),
  overview: vi.fn(),
  risks: vi.fn(),
}));

vi.mock("@hoanggia/db", () => ({
  prisma: {
    user: { findMany: h.users },
    customerCareLog: { findMany: h.logs },
  },
}));
vi.mock("./customer-care-query", () => ({
  getCareOverview: h.overview,
  getUncaredRisks: h.risks,
  vnToday: (now: Date) => {
    const t = new Date(now.getTime() + 7 * 3600_000);
    return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
  },
}));

import { getCareDetails, getCareTeamReport, openProblem, todayYmd } from "./customer-care-team";

const NOW = new Date("2026-10-19T05:00:00Z"); // 12h trưa 19/10 giờ VN
const at = (s: string) => new Date(`${s}+07:00`);

function cust(id: string, emp: string | null, over: Record<string, unknown> = {}) {
  return {
    id,
    customerCode: id,
    customerName: `Khách ${id}`,
    salesEmployee: emp ? { id: emp, name: emp === "u1" ? "An" : "Bình" } : null,
    lastCareAt: null,
    followUpAt: null,
    season: null,
    ...over,
  };
}

describe("getCareTeamReport", () => {
  beforeEach(() => {
    Object.values(h).forEach((f) => f.mockReset());
    h.users.mockResolvedValue([
      { id: "u1", name: "An" },
      { id: "u2", name: "Bình" },
    ]);
    h.risks.mockResolvedValue([]);
  });

  it("todayYmd theo giờ Việt Nam", () => {
    expect(todayYmd(new Date("2026-10-18T18:30:00Z"))).toBe("2026-10-19");
  });

  it("đếm khách khác nhau trong ngày cho từng thành viên, người chưa ghi = 0", async () => {
    h.overview.mockResolvedValue([cust("c1", "u1"), cust("c2", "u1"), cust("c3", "u2")]);
    // 1 lần gọi lọc logs kỳ + 1 lần lọc vấn đề + 1 lần cơ hội: trả theo thứ tự gọi
    h.logs
      .mockResolvedValueOnce([
        { customerId: "c1", employeeId: "u1", outcome: "NORMAL", channel: "CALL", createdAt: at("2026-10-19T09:00:00"), employee: { name: "An" }, customer: { customerCode: "c1", customerName: "Khách c1" } },
        { customerId: "c1", employeeId: "u1", outcome: "NORMAL", channel: "ZALO", createdAt: at("2026-10-19T10:00:00"), employee: { name: "An" }, customer: { customerCode: "c1", customerName: "Khách c1" } },
        { customerId: "c2", employeeId: "u1", outcome: "ISSUE", channel: "CALL", createdAt: at("2026-10-19T11:00:00"), employee: { name: "An" }, customer: { customerCode: "c2", customerName: "Khách c2" } },
        { customerId: "c3", employeeId: "u2", outcome: "NORMAL", channel: "CALL", createdAt: at("2026-10-15T09:00:00"), employee: { name: "Bình" }, customer: { customerCode: "c3", customerName: "Khách c3" } },
      ])
      .mockResolvedValue([]);
    const r = await getCareTeamReport({}, NOW);
    const an = r.members.find((m) => m.id === "u1")!;
    const binh = r.members.find((m) => m.id === "u2")!;
    expect(an.today).toMatchObject({ customers: 2, logs: 3 });
    expect(an.today.byOutcome).toEqual({ NORMAL: 2, ISSUE: 1 });
    expect(binh.today.customers).toBe(0);
    expect(binh.week).toBe(1); // ghi 15/10 nằm trong 7 ngày
    expect(r.totals).toMatchObject({ customers: 2, membersCared: 1, membersTotal: 2 });
    // chi tiết chỉ gồm các lần ghi trong NGÀY chọn (3 lần của An), có mã khách để hiện gọn
    expect(r.details).toHaveLength(3);
    expect(r.details.every((d) => d.employeeId === "u1")).toBe(true);
    expect(r.details.map((d) => d.customerCode).sort()).toEqual(["c1", "c1", "c2"]);
  });

  it("vấn đề: ISSUE chỉ đóng khi có 'Đã xử lý xong' sau nó; ghi khác không tự đóng", async () => {
    h.overview.mockResolvedValue([cust("c1", "u1"), cust("c2", "u1"), cust("c3", "u1")]);
    const log = (customerId: string, outcome: string, when: string, extra: Record<string, unknown> = {}) => ({
      id: `${customerId}-${when}`,
      customerId,
      outcome,
      issueType: null,
      note: null,
      createdAt: at(when),
      customer: { customerCode: customerId, customerName: `Khách ${customerId}` },
      employee: { name: "An" },
      ...extra,
    });
    h.logs
      .mockResolvedValueOnce([]) // log trong kỳ
      .mockResolvedValueOnce([{ customerId: "c1" }, { customerId: "c2" }, { customerId: "c3" }]) // khách từng có vấn đề
      .mockResolvedValueOnce([
        log("c1", "ISSUE", "2026-10-16T09:00:00", { issueType: "PRICE", note: "chê giá" }),
        log("c2", "RESOLVED", "2026-10-18T09:00:00"),
        log("c2", "ISSUE", "2026-10-10T09:00:00", { issueType: "QUALITY" }),
        log("c3", "NORMAL", "2026-10-18T09:00:00"),
        log("c3", "ISSUE", "2026-10-12T09:00:00", { issueType: "DELIVERY" }),
      ])
      .mockResolvedValue([]);
    const r = await getCareTeamReport({}, NOW);
    expect(r.issues.map((i) => i.customerId).sort()).toEqual(["c1", "c3"]);
    expect(r.issues.find((i) => i.customerId === "c1")).toMatchObject({ kind: "ISSUE", issueType: "PRICE", days: 3 });
    expect(r.members.find((m) => m.id === "u1")!.openIssues).toBe(2);
  });

  it("openProblem: mất khách mở tới khi khách quay lại; không liên lạc được phải 2 lần liên tiếp", () => {
    expect(openProblem([{ outcome: "LOST" }, { outcome: "NORMAL" }])).toEqual({ kind: "LOST", index: 0 });
    expect(openProblem([{ outcome: "UPCOMING_ORDER" }, { outcome: "LOST" }])).toBeNull();
    expect(openProblem([{ outcome: "NO_CONTACT" }, { outcome: "LOST" }])).toEqual({ kind: "LOST", index: 1 });
    expect(openProblem([{ outcome: "NO_CONTACT" }, { outcome: "NORMAL" }])).toBeNull();
    expect(openProblem([{ outcome: "NO_CONTACT" }, { outcome: "NO_CONTACT" }])).toEqual({ kind: "NO_CONTACT", index: 0 });
    expect(openProblem([{ outcome: "NORMAL" }, { outcome: "ISSUE" }, { outcome: "LOST" }])).toEqual({ kind: "ISSUE", index: 1 });
  });

  it("hẹn chăm sóc lại đến hạn và khách vào vụ được tính vào cảnh báo của người phụ trách", async () => {
    h.overview.mockResolvedValue([
      cust("c1", "u2", { followUpAt: at("2026-10-16T09:00:00").toISOString() }),
      cust("c2", "u2", { season: { stage: "REMIND", season: "x", seasonMonth: 12 } }),
      cust("c3", "u1", { followUpAt: at("2026-11-01T09:00:00").toISOString() }), // chưa tới hạn
    ]);
    h.logs.mockResolvedValue([]);
    const r = await getCareTeamReport({}, NOW);
    expect(r.followUps.map((f) => f.customerId)).toEqual(["c1"]);
    expect(r.followUps[0].overdueDays).toBe(3);
    expect(r.seasons).toHaveLength(1);
    expect(r.members.find((m) => m.id === "u2")!.warnings).toMatchObject({ followUps: 1, season: 1 });
    expect(r.members.find((m) => m.id === "u1")!.warnings.followUps).toBe(0);
  });

  it("SALES chỉ thấy số liệu của mình và không tải danh sách nguy cơ cả phòng", async () => {
    h.users.mockResolvedValue([{ id: "u1", name: "An" }]);
    h.overview.mockResolvedValue([cust("c1", "u1")]);
    h.logs.mockResolvedValue([]);
    const r = await getCareTeamReport({ onlyEmployeeId: "u1" }, NOW);
    expect(r.members.map((m) => m.id)).toEqual(["u1"]);
    expect(h.risks).not.toHaveBeenCalled();
  });
});

describe("getCareDetails (chọn ngày riêng cho Chi tiết chăm sóc)", () => {
  it("trả đúng chi tiết + số khách mỗi thành viên của ngày chọn, người chưa ghi vẫn có cột", async () => {
    h.users.mockResolvedValue([
      { id: "u1", name: "An" },
      { id: "u2", name: "Bình" },
    ]);
    h.logs.mockResolvedValue([
      { customerId: "c1", employeeId: "u1", outcome: "NORMAL", channel: "CALL", note: null, issueType: null, expectedMonth: null, needGroup: null, needValueBand: null, createdAt: at("2026-10-17T09:00:00"), employee: { name: "An" }, customer: { customerCode: "KH1", customerName: "Khách 1" } },
      { customerId: "c1", employeeId: "u1", outcome: "NORMAL", channel: "ZALO", note: "ok", issueType: null, expectedMonth: null, needGroup: null, needValueBand: null, createdAt: at("2026-10-17T10:00:00"), employee: { name: "An" }, customer: { customerCode: "KH1", customerName: "Khách 1" } },
    ]);
    const r = await getCareDetails({ date: "2026-10-17" }, NOW);
    expect(r.date).toBe("2026-10-17");
    expect(r.details).toHaveLength(2);
    expect(r.members.find((m) => m.id === "u1")).toMatchObject({ customers: 1, logs: 2 });
    expect(r.members.find((m) => m.id === "u2")).toMatchObject({ customers: 0, logs: 0 });
    // truy vấn đúng khoảng ngày 17/10 giờ VN
    const where = h.logs.mock.lastCall![0].where.createdAt;
    expect(where.gte).toEqual(at("2026-10-17T00:00:00"));
    expect(where.lt).toEqual(at("2026-10-18T00:00:00"));
  });
});