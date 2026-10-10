import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// GET /api/reports/export: kiểm tra tham số + phân quyền (ADMIN cả phòng, NVKD chỉ chính mình).

const h = vi.hoisted(() => ({ auth: vi.fn(), getReportData: vi.fn(), build: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/report-metrics", () => ({ getReportData: h.getReportData }));
vi.mock("@/lib/report-workbook", () => ({ buildReportWorkbook: h.build }));

import { GET } from "./route";

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/reports/export?${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u-admin", role: "ADMIN" } });
  h.getReportData.mockResolvedValue({});
  h.build.mockResolvedValue({ xlsx: { writeBuffer: async () => new ArrayBuffer(8) } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/reports/export", () => {
  it("ADMIN xuất báo cáo tháng: không giới hạn nhân viên, tên file theo kỳ", async () => {
    const res = await get("type=month&period=2026-10");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("Bao-cao-thang-2026-10.xlsx");
    const arg = h.getReportData.mock.calls[0][0];
    expect(arg.type).toBe("month");
    expect(arg.scopeEmployeeId).toBeUndefined();
    expect(arg.periods.map((p: { label: string }) => p.label)).toEqual(["10/2026", "09/2026", "08/2026"]);
  });

  it("NVKD chỉ xuất được số của chính mình", async () => {
    h.auth.mockResolvedValue({ user: { id: "u-tung", role: "SALES" } });
    await get("type=week&period=2026-W41");
    expect(h.getReportData.mock.calls[0][0].scopeEmployeeId).toBe("u-tung");
  });

  it("THẤT BẠI: sai loại / sai kỳ -> 400, không truy vấn dữ liệu", async () => {
    for (const qs of ["", "type=year&period=2026", "type=month&period=2026-13", "type=week&period=2026-10", "type=month"]) {
      expect((await get(qs)).status).toBe(400);
    }
    expect(h.getReportData).not.toHaveBeenCalled();
  });

  it("chưa đăng nhập -> 401", async () => {
    h.auth.mockResolvedValue(null);
    expect((await get("type=month&period=2026-10")).status).toBe(401);
  });
});
