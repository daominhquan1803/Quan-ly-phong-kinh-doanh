import { describe, expect, it } from "vitest";
import { findLsx, matchReport } from "./production-match";

const lsx = (itemCode: string, poCodes = ["D11.26DT01A"], extra: object = {}) => ({ lsxNo: "1", poCodes, itemCode, done: false, customerName: "K", ...extra });
const line = (itemCode: string, poCode = "D11.26DT01A", open = true) => ({ poCode, itemCode, open, hasSalesEmployee: true });

describe("findLsx", () => {
  it("khớp theo Số PO + mã; ưu tiên mã đúng hệt, sau đó mới bỏ hậu tố phiên bản", () => {
    const rows = [lsx("SI01.2"), lsx("SI01.3"), lsx("SI02")];
    expect(findLsx(line("SI01.3"), rows).map((r) => r.itemCode)).toEqual(["SI01.3"]);
    expect(findLsx(line("SI01"), rows).map((r) => r.itemCode)).toEqual(["SI01.2", "SI01.3"]);
    expect(findLsx(line("SI01", "D11.26DT99A"), rows)).toEqual([]);
  });
});

describe("matchReport", () => {
  it("đếm dòng nợ hàng: khớp, thiếu lệnh, thương mại; liệt kê LSX phòng mình không khớp", () => {
    const report = matchReport(
      [line("SI01"), line("SB09"), line("AA07"), line("ST08"), line("SI55", "D11.26DT01A", false)],
      [lsx("SI01"), lsx("SI55"), lsx("SI77", ["D11.26DT02A"]), lsx("SI88", ["D11.26HM01A"])]
    );
    expect(report).toMatchObject({ openProduction: 2, matched: 1, trading: 2 });
    expect(report.withoutLsx.map((l) => l.itemCode)).toEqual(["SB09"]);
    // SI55 khớp dòng đã giao xong -> không lỗi; HM là phòng khác -> bỏ qua.
    expect(report.unmatchedLsx.map((r) => r.itemCode)).toEqual(["SI77"]);
  });
});
