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

import { getCareTeamReport, todayYmd } from "./customer-care-team";

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

  it("vấn đề: chỉ tính khi lần ghi mới nhất của khách là ISSUE/LOST; ghi mới hơn thì coi như đã xử lý", async () => {
    h.overview.mockResolvedValue([
      cust("c1", "u1", { lastCareAt: at("2026-10-16T09:00:00").toISOString() }), // mới nhất là ISSUE
      cust("c2", "u1", { lastCareAt: at("2026-10-18T09:00:00").toISOString() }), // có ghi mới hơn ISSUE cũ
    ]);
    h.logs
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { customerId: "c1", outcome: "ISSUE", issueType: "PRICE", note: "chê giá", createdAt: at("2026-10-16T09:00:00"), customer: { customerCode: "c1", customerName: "Khách c1" }, employee: { name: "An" } },
        { customerId: "c2", outcome: "ISSUE", issueType: "QUALITY", note: null, createdAt: at("2026-10-10T09:00:00"), customer: { customerCode: "c2", customerName: "Khách c2" }, employee: { name: "An" } },
      ])
      .mockResolvedValue([]);
    const r = await getCareTeamReport({}, NOW);
    expect(r.issues.map((i) => i.customerId)).toEqual(["c1"]);
    expect(r.issues[0]).toMatchObject({ kind: "ISSUE", issueType: "PRICE", days: 3 });
    expect(r.members.find((m) => m.id === "u1")!.openIssues).toBe(1);
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
