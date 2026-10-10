import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ lines: vi.fn() }));
vi.mock("@hoanggia/db", () => ({ prisma: { poTrackingLine: { findMany: h.lines } }, getPoAggregates: vi.fn() }));

import { getOihAsOf } from "./dashboard-metrics";

const d = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);
const AS_OF = d("2026-10-01"); // = cuối ngày 30/09

const line = (o: Record<string, unknown>) => ({
  salesEmployeeId: "u1", poValue: 1000, poDate: d("2026-08-01"), deliveredValue: 0, statusRaw: "Đang thực hiện",
  manuallyClosedAt: null, deliveryEvents: [], ...o,
});

describe("getOihAsOf", () => {
  it("chỉ trừ các đợt giao trước mốc; PO đặt sau mốc không tính; PO không có ngày đặt coi như đã đặt", async () => {
    h.lines.mockResolvedValue([
      line({ deliveryEvents: [{ value: 300, eventDate: d("2026-09-30") }, { value: 200, eventDate: d("2026-10-01") }] }), // 1000-300
      line({ poDate: d("2026-10-01") }), // đặt sau mốc
      line({ poDate: null, poValue: 500 }), // 500
    ]);
    expect((await getOihAsOf(AS_OF)).get("u1")).toBe(1200);
  });

  it("dòng đã Kết thúc: giao đủ nhưng giao SAU mốc -> vẫn tính tại mốc; đóng/huỷ chưa giao đủ -> bỏ, trừ khi đóng thủ công sau mốc", async () => {
    h.lines.mockResolvedValue([
      line({ statusRaw: "Kết thúc", deliveredValue: 1000, deliveryEvents: [{ value: 1000, eventDate: d("2026-10-05") }] }), // 1000
      line({ statusRaw: "Kết thúc", deliveredValue: 400, deliveryEvents: [{ value: 400, eventDate: d("2026-08-05") }] }), // huỷ -> bỏ
      line({ statusRaw: "Kết thúc", deliveredValue: 0, manuallyClosedAt: d("2026-10-03") }), // đóng sau mốc -> 1000
      line({ statusRaw: "Kết thúc", deliveredValue: 1000, deliveryEvents: [{ value: 1000, eventDate: d("2026-09-01") }] }), // đã giao hết trước mốc -> 0
    ]);
    expect((await getOihAsOf(AS_OF)).get("u1")).toBe(2000);
  });

  it("kẹp ≥ 0 khi giao vượt; tách theo nhân viên", async () => {
    h.lines.mockResolvedValue([
      line({ deliveryEvents: [{ value: 1500, eventDate: d("2026-09-01") }] }),
      line({ salesEmployeeId: "u2", poValue: 250 }),
    ]);
    const m = await getOihAsOf(AS_OF);
    expect(m.get("u1")).toBeUndefined();
    expect(m.get("u2")).toBe(250);
  });
});
