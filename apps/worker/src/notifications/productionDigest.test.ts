import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), push: vi.fn() }));
vi.mock("@hoanggia/db", () => ({ prisma: { notification: { findFirst: h.findFirst, create: h.create, update: h.update } } }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../push", () => ({ sendPushToUser: h.push }));

const row = { employeeId: "u1", late: 2, atRisk: 1, done: 3, top: [{ poCode: "D11.26MQ01A", itemCode: "SI01", customerCode: "C.A", dueOn: "2026-11-19T17:00:00.000Z", alert: "LATE" }] };
const MONDAY = new Date("2026-11-30T01:00:00Z"); // 8h thứ Hai giờ Việt Nam

async function load() {
  vi.stubEnv("INTERNAL_SYNC_TOKEN", "t");
  vi.resetModules();
  return import("./productionDigest");
}
const serve = (syncedAt: string | null) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ syncedAt, rows: [row] }))));

describe("productionDigest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("nội dung: số đếm ở tiêu đề, mỗi dòng gấp một gạch đầu dòng, ngày theo giờ Việt Nam", async () => {
    const { buildProductionMessage } = await load();
    const m = buildProductionMessage(row);
    expect(m.title).toBe("Tiến độ hàng: 2 trễ, 1 nguy cơ trễ, 3 xong chưa giao");
    expect(m.message).toContain("• D11.26MQ01A · SI01 · C.A · hạn 20/11 · Trễ");
  });

  it("tạo thông báo cho NVKD; đã gửi trong ngày thì không gửi lại", async () => {
    const { runProductionDigest } = await load();
    serve("2026-11-30T00:45:00Z");
    h.create.mockResolvedValue({ id: "n1" });
    expect(await runProductionDigest(MONDAY)).toEqual({ notified: 1 });
    expect(h.create.mock.calls[0][0].data).toMatchObject({ userId: "u1", type: "PRODUCTION_DAILY", link: "/shipping-status?tab=production" });
    serve("2026-11-30T00:45:00Z");
    h.findFirst.mockResolvedValue({ id: "n1" });
    expect(await runProductionDigest(MONDAY)).toEqual({ notified: 0 });
  });

  it("THẤT BẠI: Chủ nhật, hoặc số liệu sản xuất cũ quá 3 giờ -> không gửi", async () => {
    const { runProductionDigest } = await load();
    serve("2026-11-29T00:45:00Z");
    expect(await runProductionDigest(new Date("2026-11-29T01:00:00Z"))).toEqual({ notified: 0 });
    serve("2026-11-28T11:45:00Z");
    expect(await runProductionDigest(MONDAY)).toEqual({ notified: 0 });
    serve(null);
    expect(await runProductionDigest(MONDAY)).toEqual({ notified: 0 });
    expect(h.create).not.toHaveBeenCalled();
  });
});
