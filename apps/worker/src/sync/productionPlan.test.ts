import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ tx: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() }));
vi.mock("@hoanggia/db", () => ({ prisma: { productionLine: { deleteMany: h.deleteMany, createMany: h.createMany }, $transaction: h.tx } }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { parseProductionRecords, runProductionPlanSync } from "./productionPlan";

const record = (j: object, id = "r1") => ({ id, data: { j } });
const base = { ma: "21626", soPO: "D10.26PD10A + D10.26PD11A", codes: [{ ma: "SI08067" }, { ma: "SI08068" }, { ma: "SI08067" }], slYeuCau: 6000, ngayLenh: "29/10/2026", ngayGiao: "02/11/2026", done: false, runningOn: "Đóng gói", mayList: ["Bế", "Đóng gói"], journeyLog: [{}], gh: { dk: { ngay: "2026-11-28", gio: "09:00" } } };

describe("parseProductionRecords", () => {
  it("tách nhiều PO, nhiều mã (bỏ mã trùng), đọc ngày dd/mm/yyyy", () => {
    const rows = parseProductionRecords([record(base)]);
    expect(rows.map((r) => r.itemCode)).toEqual(["SI08067", "SI08068"]);
    expect(rows[0]).toMatchObject({ id: "r1#0", lsxNo: "21626", poCodes: ["D10.26PD10A", "D10.26PD11A"], quantity: 6000, hasProgress: true, runningOn: "Đóng gói", currentStages: "Bế, Đóng gói", plannedShipTime: "09:00" });
    expect(rows[0].dueOn?.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("bỏ LSX đã huỷ và dòng thiếu Số PO hoặc mã hàng; nhận cả j dạng chuỗi và mã trong maHang", () => {
    expect(parseProductionRecords([record({ ...base, huy: true }), record({ ...base, soPO: "" }), record({ ...base, codes: [], maHang: "" })])).toEqual([]);
    const rows = parseProductionRecords([{ id: "r2", data: { j: JSON.stringify({ ...base, codes: [], maHang: "SB1 + SB2" }) } }]);
    expect(rows.map((r) => r.itemCode)).toEqual(["SB1", "SB2"]);
  });
});

describe("runProductionPlanSync", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  const env = () => {
    vi.stubEnv("LENHSX_USER", "tester");
    vi.stubEnv("LENHSX_PASSWORD", "x");
  };

  it("đăng nhập, đọc LSX bằng cookie, thay toàn bộ bảng", async () => {
    env();
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { "set-cookie": "sid=abc; Path=/; HttpOnly" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([record(base)])));
    vi.stubGlobal("fetch", f);
    expect(await runProductionPlanSync()).toBe(2);
    expect(f.mock.calls[1][1].headers.Cookie).toBe("sid=abc");
    expect(h.tx).toHaveBeenCalledTimes(1);
  });

  it("THẤT BẠI: sai mật khẩu hoặc dữ liệu rỗng -> giữ nguyên dữ liệu cũ", async () => {
    env();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("login", { status: 200 })));
    await expect(runProductionPlanSync()).rejects.toThrow("Đăng nhập");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { "set-cookie": "sid=abc" } }))
      .mockResolvedValueOnce(new Response("[]")));
    await expect(runProductionPlanSync()).rejects.toThrow("rỗng");
    expect(h.tx).not.toHaveBeenCalled();
  });
});
