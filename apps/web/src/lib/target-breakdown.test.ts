import { describe, it, expect, vi } from "vitest";

vi.mock("@hoanggia/db", () => ({ prisma: {} }));
vi.mock("./dashboard-metrics", () => ({ getOihItemRows: vi.fn(), monthRange: vi.fn() }));

import { groupByCustomer, groupOfItemCode } from "./target-breakdown";

describe("groupOfItemCode", () => {
  it("SI/SB là Sản xuất, mã khác là Thương mại, không mã thì không xếp nhóm", () => {
    expect(groupOfItemCode("SI0123")).toBe("Sản xuất");
    expect(groupOfItemCode(" sb-9 ")).toBe("Sản xuất");
    expect(groupOfItemCode("TM001")).toBe("Thương mại");
    expect(groupOfItemCode("")).toBeNull();
    expect(groupOfItemCode(null)).toBeNull();
  });
});

describe("groupByCustomer", () => {
  const names = new Map([
    ["ABC", { code: "ABC", name: "Công ty ABC" }],
    ["XYZ", { code: "X.XYZ", name: "Công ty XYZ" }],
  ]);

  it("gộp theo mã chuẩn hoá (tiền tố khác nhau vẫn cùng khách), đếm số PO khác nhau, sắp theo giá trị giảm dần", () => {
    const rows = groupByCustomer(
      [
        { customerCode: "ABC", poCode: "PO1", value: 100 },
        { customerCode: "C.ABC", poCode: "PO1", value: 50 },
        { customerCode: "abc", poCode: "PO2", value: 25 },
        { customerCode: "XYZ", poCode: "PO3", value: 500 },
      ],
      names
    );
    expect(rows.map((r) => [r.customerCode, r.customerName, r.value, r.poCount])).toEqual([
      ["X.XYZ", "Công ty XYZ", 500, 1],
      ["ABC", "Công ty ABC", 175, 2],
    ]);
  });

  it("khách chưa có trong danh sách: hiện mã gốc, không có tên; dòng không rõ khách gom riêng", () => {
    const rows = groupByCustomer(
      [
        { customerCode: "LẠ", poCode: "P1", value: 10 },
        { customerCode: null, poCode: "P2", value: 5 },
        { customerCode: " ", poCode: "P3", value: 1 },
      ],
      names
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ customerCode: "LẠ", customerName: "", value: 10 });
    expect(rows[1]).toMatchObject({ customerCode: "(không rõ khách)", value: 6, poCount: 2 });
  });

  it("tổng các dòng bằng tổng đầu vào", () => {
    const items = [
      { customerCode: "ABC", poCode: "A", value: 1.5 },
      { customerCode: "XYZ", poCode: "B", value: 2.25 },
    ];
    expect(groupByCustomer(items, names).reduce((s, r) => s + r.value, 0)).toBe(3.75);
  });
});
