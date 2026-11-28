import { describe, expect, it } from "vitest";
import { buildDigests, findLsx, progressFor, unmatchedLsx, type LsxRow } from "./production-match";

const lsx = (itemCode: string, extra: Partial<LsxRow> = {}): LsxRow => ({
  lsxNo: "1", poCodes: ["D11.26DT01A"], itemCode, customerName: "K", done: false, hasProgress: false, runningOn: null,
  currentStages: null, plannedMachine: null, completedOn: null, plannedShipOn: null, plannedShipTime: null, hideAutoPlan: false, ...extra,
});
const line = (itemCode: string, poCode = "D11.26DT01A") => ({ poCode, itemCode, hasSalesEmployee: true });
const TOMORROW = "2026-11-28";

describe("findLsx", () => {
  it("khớp theo Số PO + mã; ưu tiên mã đúng hệt, sau đó mới bỏ hậu tố phiên bản", () => {
    const rows = [lsx("SI01.2"), lsx("SI01.3"), lsx("SI02")];
    expect(findLsx(line("SI01.3"), rows).map((r) => r.itemCode)).toEqual(["SI01.3"]);
    expect(findLsx(line("SI01"), rows).map((r) => r.itemCode)).toEqual(["SI01.2", "SI01.3"]);
    expect(findLsx(line("SI01", "D11.26DT99A"), rows)).toEqual([]);
  });
});

describe("progressFor", () => {
  it("nhiều lệnh -> lấy trạng thái chậm nhất", () => {
    const done = lsx("SI01", { done: true, completedOn: new Date("2026-11-20") });
    const running = lsx("SI01", { lsxNo: "2", hasProgress: true, runningOn: "Máy 4", currentStages: "Bế" });
    expect(progressFor(line("SI01"), [done], 5, TOMORROW)).toMatchObject({ status: "DONE", alert: "DONE_NOT_SHIPPED" });
    expect(progressFor(line("SI01"), [done], -1, TOMORROW)).toMatchObject({ status: "DONE", alert: "LATE" });
    expect(progressFor(line("SI01"), [done, running], 5, TOMORROW)).toMatchObject({ status: "RUNNING", alert: null, stage: "Đang chạy Máy 4" });
    expect(progressFor(line("SI01"), [running, lsx("SI01")], 5, TOMORROW).status).toBe("WAITING");
  });

  it("cảnh báo trễ, nguy cơ trễ; hàng thương mại không cảnh báo", () => {
    const running = lsx("SI01", { hasProgress: true });
    expect(progressFor(line("SI01"), [running], -1, TOMORROW).alert).toBe("LATE");
    expect(progressFor(line("SI01"), [running], 2, TOMORROW).alert).toBeNull();
    expect(progressFor(line("SI01"), [lsx("SI01")], 3, TOMORROW).alert).toBe("AT_RISK");
    expect(progressFor(line("SI09"), [], 0, TOMORROW)).toMatchObject({ status: "NO_LSX", alert: "AT_RISK" });
    expect(progressFor(line("AA07"), [], -9, TOMORROW)).toMatchObject({ status: "TRADING", alert: null });
  });

  it("PO đặt trước khi có dữ liệu sản xuất, không có lệnh -> PO cũ, không cảnh báo", () => {
    const since = new Date("2026-10-12T00:00:00Z");
    const at = (poDate: string, code = "SI09", rows: LsxRow[] = []) => progressFor({ ...line(code), poDate: new Date(poDate) }, rows, -30, TOMORROW, since);
    expect(at("2026-09-30T00:00:00Z")).toMatchObject({ status: "OLD_PO", alert: null });
    // 00:00 ngày 12/10 giờ Việt Nam = 17:00 ngày 11/10 UTC -> vẫn tính là ngày 12/10.
    expect(at("2026-10-11T17:00:00Z")).toMatchObject({ status: "NO_LSX", alert: "LATE" });
    expect(at("2026-09-30T00:00:00Z", "SI01", [lsx("SI01")]).status).toBe("WAITING");
    expect(at("2026-09-30T00:00:00Z", "AA07").status).toBe("TRADING");
  });

  it("dự kiến xong: ngày đặt tay, hoặc quy tắc công đoạn cuối cho ngày mai", () => {
    const eta = (extra: Partial<LsxRow>) => progressFor(line("SI01"), [lsx("SI01", { hasProgress: true, ...extra })], 5, TOMORROW).eta;
    expect(eta({ currentStages: "Xẻ - QC, Đóng gói" })).toEqual({ date: TOMORROW, time: "09:00" });
    expect(eta({ currentStages: "Bế" })).toBeNull();
    expect(eta({ currentStages: "Cắt tờ", hideAutoPlan: true })).toBeNull();
    expect(eta({ currentStages: "Bế", plannedShipOn: new Date("2026-12-01"), plannedShipTime: "14:00" })).toEqual({ date: "2026-12-01", time: "14:00" });
  });
});

describe("buildDigests", () => {
  it("đếm theo NVKD, xếp dòng gấp trước, tối đa 5, bỏ dòng không cảnh báo", () => {
    const at = (employee: string, alert: "LATE" | "AT_RISK" | "DONE_NOT_SHIPPED" | null, day: number) => ({ salesEmployeeId: employee, alert, poCode: `P${day}`, itemCode: "SI01", customerCode: "C", dueOn: new Date(Date.UTC(2026, 10, day)) });
    const digests = buildDigests([at("u1", "DONE_NOT_SHIPPED", 1), at("u1", "AT_RISK", 28), at("u1", "LATE", 20), at("u1", "LATE", 15), at("u1", "LATE", 25), at("u1", "LATE", 26), at("u1", null, 2), at("u2", null, 3)]);
    expect(digests).toHaveLength(1);
    expect(digests[0]).toMatchObject({ employeeId: "u1", late: 4, atRisk: 1, done: 1 });
    expect(digests[0].top.map((l) => l.poCode)).toEqual(["P15", "P20", "P25", "P26", "P28"]);
  });
});

describe("unmatchedLsx", () => {
  it("chỉ báo lệnh chưa xong của phòng mình không khớp PO nào", () => {
    const rows = [lsx("SI01"), lsx("SI77", { poCodes: ["D11.26DT02A"] }), lsx("SI88", { poCodes: ["D11.26HM01A"] }), lsx("SI99", { done: true })];
    expect(unmatchedLsx([line("SI01")], rows).map((r) => r.itemCode)).toEqual(["SI77"]);
  });
});
