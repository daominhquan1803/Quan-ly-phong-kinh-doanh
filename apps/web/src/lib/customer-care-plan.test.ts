import { describe, it, expect, vi } from "vitest";

vi.mock("@hoanggia/db", () => ({ prisma: {}, normalizeCustomerCode: (s: string) => s }));

import {
  CARE_TRACKING_START,
  careScoreFraction,
  classifyTiers,
  coveragePct,
  fakePenalty,
  overdueDaysAt,
  pickWeekly,
  vnDayOf,
  workingDays,
} from "./customer-care-plan";
import { buildDailyMessage, dueToday } from "./customer-care-alerts";
import { computeKpiScores } from "./kpi-metrics";

const d = (ymd: string) => vnDayOf(ymd);
const START = d(CARE_TRACKING_START); // 20/10/2026

describe("xếp hạng khách", () => {
  const asOf = d("2026-11-01");
  it("A = nhóm tạo 80% doanh số; B ≥ 3 đơn; C 1–2 đơn; Ngủ = không mua 6–12 tháng; quá 12 tháng không vào lịch", () => {
    const t = classifyTiers(
      [
        { id: "big", value: 700, orders: 10, lastOrder: d("2026-10-20") },
        { id: "mid", value: 150, orders: 4, lastOrder: d("2026-10-01") },
        { id: "small", value: 100, orders: 5, lastOrder: d("2026-09-01") },
        { id: "rare", value: 50, orders: 1, lastOrder: d("2026-08-01") },
        { id: "sleep", value: 900, orders: 3, lastOrder: d("2026-03-01") },
        { id: "gone", value: 999, orders: 2, lastOrder: d("2025-09-01") },
      ],
      asOf
    );
    // 700+150+100+50 = 1000: big (cum 0 < 800) A, mid (cum 700 < 800) A, small (850 ≥ 800) -> 5 đơn = B, rare -> C
    expect(Object.fromEntries(t)).toEqual({ big: "A", mid: "A", small: "B", rare: "C", sleep: "NGU" });
  });
});

describe("hạn chăm sóc", () => {
  it("chưa chạm từ mốc theo dõi: hạn đầu tiên = mốc + chu kỳ", () => {
    expect(overdueDaysAt([], 7, d("2026-10-27"), START)).toBe(0); // hạn hôm nay
    expect(overdueDaysAt([], 7, d("2026-10-30"), START)).toBe(3);
    expect(overdueDaysAt([], 60, d("2026-10-30"), START)).toBeLessThan(0);
  });
  it("chạm mới (ghi / đi gặp / đơn) dời hạn", () => {
    const touches = [d("2026-10-25") + 10 * 3600_000];
    expect(overdueDaysAt(touches, 7, d("2026-11-01"), START)).toBe(0);
    expect(overdueDaysAt(touches, 7, d("2026-11-03"), START)).toBe(2);
  });
  it("ngày làm việc bỏ Chủ nhật (25/10/2026 là Chủ nhật)", () => {
    const days = workingDays(d("2026-10-24"), d("2026-10-27"));
    expect(days.map((x) => new Date(x + 7 * 3600_000).toISOString().slice(0, 10))).toEqual(["2026-10-24", "2026-10-26", "2026-10-27"]);
  });
  it("độ phủ = trung bình theo ngày % khách chưa quá hạn", () => {
    const customers = [
      { touches: [d("2026-10-21")], cycle: 7 }, // hạn 28/10
      { touches: [], cycle: 7 }, // hạn 27/10
    ];
    // 28/10: cả 2 chưa quá? khách 2 trễ 1 ngày -> 50%; 29/10: khách 1 trễ? hạn 28 -> trễ 1 -> 0%
    expect(coveragePct(customers, [d("2026-10-26")], START)).toBe(100);
    expect(coveragePct(customers, [d("2026-10-28")], START)).toBe(50);
    expect(coveragePct(customers, [d("2026-10-26"), d("2026-10-28"), d("2026-10-29")], START)).toBe(50);
    expect(coveragePct([], [d("2026-10-28")], START)).toBeNull();
  });
});

describe("điểm CSKH", () => {
  it("50% đúng hạn + 30% khách A + 20% (cảnh báo, vấn đề); thiếu dữ liệu = đủ", () => {
    expect(careScoreFraction({ onTimePct: 100, aPct: 100, alertPct: null, issuePct: null })).toBe(1);
    expect(careScoreFraction({ onTimePct: 80, aPct: 50, alertPct: 100, issuePct: 0 })).toBeCloseTo(0.4 + 0.15 + 0.1);
  });
  it("ghi khống trừ 5đ/lần, tối đa 10đ", () => {
    expect(fakePenalty(0)).toBe(0);
    expect(fakePenalty(1)).toBe(5);
    expect(fakePenalty(3)).toBe(10);
  });
  it("KPI NVKD: có điểm CSKH thì thay cách đếm lượt đi gặp; ghi khống trừ thêm", () => {
    const base = {
      targetRevenue: 1000, actualRevenue: 1000, weightRevenue: 30,
      targetRevenueSX: 400, actualRevenueSX: 400, weightRevenueSX: 20,
      targetNewCustomers: 2, actualNewCustomers: 2, weightNewCustomers: 10,
      debtOverduePct: 10, debtCollectionRatePct: 100,
      visitTarget: 10, approvedVisitCount: 0, weightVisit: 10, violationCount: 0, weekScore: 8,
    };
    expect(computeKpiScores(base).scoreVisit).toBe(0); // cách cũ: 0 lượt đi gặp
    const r = computeKpiScores({ ...base, careFraction: 0.85, careFakes: 1 });
    expect(r.scoreVisit).toBe(8.5);
    expect(r.carePenalty).toBe(5);
    expect(r.totalScore).toBe(100 - 1.5 - 5);
  });
});

describe("tin nhắc 8h & kiểm tra chéo", () => {
  const row = (id: string, tier: "A" | "B" | "C" | "NGU", overdueDays: number, value12 = 0) => ({
    id, customerCode: id, customerName: id, employeeId: "u1", tier, cycle: 7, value12, lastOrderAt: null, touches: [], lastTouch: null, overdueDays,
  });
  it("danh sách cần chạm: quá hạn + hạn hôm nay, A trước, trễ lâu trước", () => {
    const list = dueToday([row("C1", "C", 5), row("A1", "A", 0), row("A2", "A", 3), row("B1", "B", -2)]);
    expect(list.map((c) => c.id)).toEqual(["A2", "A1", "C1"]);
    const msg = buildDailyMessage("u1", list, d("2026-10-28"))!;
    expect(msg.title).toBe("Hôm nay cần chạm 3 khách (2 khách A)");
    expect(msg.message).toContain("A2 (A, trễ 3 ngày)");
    expect(msg.link).toBe("/cham-soc?due=2026-10-28");
    expect(buildDailyMessage("u1", [], d("2026-10-28"))).toBeNull();
  });
  it("chọn ngẫu nhiên cố định theo tuần", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `log${i}` }));
    const a = pickWeekly(rows, "2026-10-19", 3);
    expect(a).toHaveLength(3);
    expect(pickWeekly(rows, "2026-10-19", 3)).toEqual(a);
    expect(pickWeekly(rows, "2026-10-26", 3)).not.toEqual(a);
  });
});

