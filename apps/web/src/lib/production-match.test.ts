import { describe, expect, it } from "vitest";
import { findLsx, progressFor, unmatchedLsx, type LsxRow } from "./production-match";

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

  it("dự kiến xong: ngày đặt tay, hoặc quy tắc công đoạn cuối cho ngày mai", () => {
    const eta = (extra: Partial<LsxRow>) => progressFor(line("SI01"), [lsx("SI01", { hasProgress: true, ...extra })], 5, TOMORROW).eta;
    expect(eta({ currentStages: "Xẻ - QC, Đóng gói" })).toEqual({ date: TOMORROW, time: "09:00" });
    expect(eta({ currentStages: "Bế" })).toBeNull();
    expect(eta({ currentStages: "Cắt tờ", hideAutoPlan: true })).toBeNull();
    expect(eta({ currentStages: "Bế", plannedShipOn: new Date("2026-12-01"), plannedShipTime: "14:00" })).toEqual({ date: "2026-12-01", time: "14:00" });
  });
});

describe("unmatchedLsx", () => {
  it("chỉ báo lệnh chưa xong của phòng mình không khớp PO nào", () => {
    const rows = [lsx("SI01"), lsx("SI77", { poCodes: ["D11.26DT02A"] }), lsx("SI88", { poCodes: ["D11.26HM01A"] }), lsx("SI99", { done: true })];
    expect(unmatchedLsx([line("SI01")], rows).map((r) => r.itemCode)).toEqual(["SI77"]);
  });
});
