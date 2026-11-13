import { describe, it, expect, vi } from "vitest";

vi.mock("@hoanggia/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@hoanggia/db")>()), prisma: {} }));
vi.mock("./amis", () => ({ getAmisToken: vi.fn() }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { planCustomerSync, ownerCodeFromLabel, isJunkCustomer, type AmisCustomer, type ExistingCustomer } from "./amisCustomers";

const users = [
  { id: "hieu", amisEmployeeCode: "LEHIEU" },
  { id: "tung", amisEmployeeCode: "THANHTUNG" },
];
const amis = (o: Partial<AmisCustomer>): AmisCustomer => ({
  account_number: "T.LEGEND BRIGHT",
  account_name: "CÔNG TY LEGEND BRIGHT",
  owner_name: "Lê Đình Hiếu (LEHIEU)",
  office_tel: null,
  billing_address: null,
  inactive: null,
  ...o,
});
const ours = (o: Partial<ExistingCustomer>): ExistingCustomer => ({ customerCode: "LEGEND BRIGHT", salesEmployeeId: "hieu", address: null, contactPhone: null, ...o });

describe("ghép người phụ trách AMIS", () => {
  it("lấy mã trong ngoặc cuối nhãn", () => {
    expect(ownerCodeFromLabel("Ngô Thanh Tùng- 0971.450.999 (THANHTUNG)")).toBe("THANHTUNG");
    expect(ownerCodeFromLabel("Lê Đình Hiếu (LEHIEU)")).toBe("LEHIEU");
    expect(ownerCodeFromLabel("Nguyễn Khánh Toàn")).toBeNull();
    expect(ownerCodeFromLabel(null)).toBeNull();
  });
  it("nhận ra khách rác", () => {
    expect(isJunkCustomer("NGUOITIEUDUNG01", "Ai đó")).toBe(true);
    expect(isJunkCustomer("X", "NHAPS")).toBe(true);
    expect(isJunkCustomer("LEGEND", "Công ty LEGEND")).toBe(false);
  });
});

describe("planCustomerSync", () => {
  it("khách mới của NVKD đang quản lý: tạo với mã chuẩn hoá, kèm địa chỉ và SĐT", () => {
    const p = planCustomerSync([amis({ billing_address: " Bắc Ninh ", office_tel: "0900" })], [], users);
    expect(p.creates).toEqual([{ customerCode: "LEGEND BRIGHT", customerName: "CÔNG TY LEGEND BRIGHT", salesEmployeeId: "hieu", address: "Bắc Ninh", contactPhone: "0900" }]);
  });

  it("mã AMIS có tiền tố khác nhau nhưng cùng mã chuẩn hoá với khách đã có: không tạo trùng", () => {
    const p = planCustomerSync([amis({ account_number: "V.LEGEND BRIGHT" })], [ours({})], users);
    expect(p.creates).toHaveLength(0);
  });

  it("khách của người không thuộc NVKD quản lý (hoặc không có chủ): không tạo, ghi vào danh sách chưa ghép", () => {
    const p = planCustomerSync(
      [
        amis({ account_number: "A", owner_name: "Ngô Thanh Tùng_0986 (BỎ)" }),
        amis({ account_number: "B", owner_name: null }),
        amis({ account_number: "C", owner_name: "Người lạ (XYZ)" }),
      ],
      [],
      users
    );
    expect(p.creates).toHaveLength(0);
    expect(p.skippedNotManaged).toBe(3);
    expect(p.unmappedOwners["Ngô Thanh Tùng_0986 (BỎ)"]).toBe(1);
    expect(p.unmappedOwners["(chưa có người phụ trách)"]).toBe(1);
  });

  it("bỏ khách rác, khách ngừng hoạt động và dòng thiếu mã/tên", () => {
    const p = planCustomerSync(
      [
        amis({ account_number: "NGUOITIEUDUNG1" }),
        amis({ account_number: "D", account_name: "NHAPS" }),
        amis({ account_number: "E", inactive: true }),
        amis({ account_number: null }),
        amis({ account_number: "F", account_name: " " }),
      ],
      [],
      users
    );
    expect(p.creates).toHaveLength(0);
  });

  it("trùng mã sau chuẩn hoá: dòng đầu tiên thắng", () => {
    const p = planCustomerSync([amis({ account_name: "BẢN MỚI" }), amis({ account_number: "C.LEGEND BRIGHT", account_name: "BẢN CŨ" })], [], users);
    expect(p.creates.map((c) => c.customerName)).toEqual(["BẢN MỚI"]);
  });

  it("khách đã có: chỉ điền chỗ trống, không ghi đè địa chỉ/SĐT/NVKD đã có và không đổi tên", () => {
    const p = planCustomerSync(
      [amis({ account_name: "TÊN KHÁC", owner_name: "Ngô Thanh Tùng (THANHTUNG)", billing_address: "Địa chỉ AMIS", office_tel: "0911" })],
      [ours({ address: "Địa chỉ ta", contactPhone: null })],
      users
    );
    expect(p.updates).toEqual([{ customerCode: "LEGEND BRIGHT", data: { contactPhone: "0911" } }]);
  });

  it("khách đã có chưa có NVKD: gán theo chủ trên AMIS", () => {
    const p = planCustomerSync([amis({})], [ours({ salesEmployeeId: null, address: "x", contactPhone: "y" })], users);
    expect(p.updates).toEqual([{ customerCode: "LEGEND BRIGHT", data: { salesEmployeeId: "hieu" } }]);
  });

  it("khách đã có và đủ dữ liệu: không có gì để cập nhật; khách đã có thuộc người khác vẫn không bị tạo lại", () => {
    const p = planCustomerSync([amis({ owner_name: "Người lạ (XYZ)" })], [ours({ address: "x", contactPhone: "y" })], users);
    expect(p.updates).toHaveLength(0);
    expect(p.creates).toHaveLength(0);
    expect(p.skippedNotManaged).toBe(0);
  });
});
