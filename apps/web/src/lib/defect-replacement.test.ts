import { describe, expect, it } from "vitest";
import { findDefectCandidates, isDefectComplete, latestDate, OpenDefectItem } from "./defect-replacement";

const D = (o: Partial<OpenDefectItem>): OpenDefectItem => ({
  defectReportId: "d1",
  reportNumber: "HL-1",
  customerName: "Công ty A",
  itemId: "i1",
  itemCode: "SB1",
  itemName: "Hộp SB1",
  defectQty: 100,
  replacedQty: 0,
  ...o,
});
const slip = { itemCode: "SB1.2", itemName: "Hộp SB1", customerName: "CÔNG TY  A" };

describe("findDefectCandidates", () => {
  it("khớp mã (bỏ hậu tố .N), cùng khách xếp trước", () => {
    const r = findDefectCandidates(slip, [D({ defectReportId: "d2", reportNumber: "HL-2", customerName: "Công ty B", itemId: "i2" }), D({})]);
    expect(r.map((x) => x.reportNumber)).toEqual(["HL-1", "HL-2"]);
    expect(r[0].sameCustomer).toBe(true);
    expect(r[1].sameCustomer).toBe(false);
  });
  it("khớp theo tên khi phiếu thiếu mã", () => {
    expect(findDefectCandidates({ ...slip, itemCode: null }, [D({ itemCode: "XX" })])).toHaveLength(1);
  });
  it("bỏ mã đã đổi đủ và mã khác", () => {
    expect(findDefectCandidates(slip, [D({ replacedQty: 100 }), D({ itemCode: "ZZ", itemName: "Khác", itemId: "i3" })])).toEqual([]);
  });
  it("remaining = SL lỗi - đã đổi", () => {
    expect(findDefectCandidates(slip, [D({ replacedQty: 40 })])[0].remaining).toBe(60);
  });
});

describe("isDefectComplete", () => {
  it("đủ khi mọi mã đã đổi >= SL lỗi", () => {
    expect(isDefectComplete([{ defectQty: 10, replacedQty: 10 }, { defectQty: 5, replacedQty: 5 }])).toBe(true);
    expect(isDefectComplete([{ defectQty: 10, replacedQty: 10 }, { defectQty: 5, replacedQty: 4 }])).toBe(false);
    expect(isDefectComplete([])).toBe(false);
  });
});

describe("latestDate", () => {
  it("lấy ngày lớn nhất, không có thì dùng fallback", () => {
    const f = new Date("2026-11-01");
    expect(latestDate([new Date("2026-10-20"), null, new Date("2026-10-25")], f)).toEqual(new Date("2026-10-25"));
    expect(latestDate([null], f)).toBe(f);
  });
});
