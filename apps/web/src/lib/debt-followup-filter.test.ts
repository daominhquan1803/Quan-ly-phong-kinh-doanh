import { describe, expect, it } from "vitest";
import { filterFollowUp, statusKey, statusLabel, statusOptions } from "./debt-followup-filter";

const R = (employeeName: string, customerCode: string, kind: "planned" | "slipped", slippedWeeks = 0) => ({ employeeName, customerCode, kind, slippedWeeks });
const rows = [R("Quân", "MYVIET", "slipped", 3), R("Quân", "VNPTHANOI", "slipped", 2), R("Tấn", "OT-VN", "slipped", 3), R("Tấn", "MYVIET", "planned")];

describe("lọc bảng cần thu tuần", () => {
  it("không chọn gì thì giữ nguyên", () => {
    expect(filterFollowUp(rows, { employee: "", customer: "", status: "" })).toHaveLength(4);
  });
  it("lọc theo nhân viên, khách hàng, tình trạng và kết hợp", () => {
    expect(filterFollowUp(rows, { employee: "Tấn", customer: "", status: "" })).toHaveLength(2);
    expect(filterFollowUp(rows, { employee: "", customer: "MYVIET", status: "" })).toHaveLength(2);
    expect(filterFollowUp(rows, { employee: "", customer: "", status: "slipped-3" })).toHaveLength(2);
    expect(filterFollowUp(rows, { employee: "Tấn", customer: "MYVIET", status: "planned" })).toEqual([rows[3]]);
  });
  it("khoá và nhãn tình trạng; danh sách tình trạng: Kế hoạch tuần trước, trượt tăng dần", () => {
    expect(statusKey(rows[0])).toBe("slipped-3");
    expect(statusKey(rows[3])).toBe("planned");
    expect(statusLabel("slipped-2")).toBe("Trượt 2 tuần");
    expect(statusLabel("planned")).toBe("Kế hoạch tuần");
    expect(statusOptions(rows)).toEqual(["planned", "slipped-2", "slipped-3"]);
  });
});
