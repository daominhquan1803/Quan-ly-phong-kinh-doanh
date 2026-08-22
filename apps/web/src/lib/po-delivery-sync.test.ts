import { describe, it, expect } from "vitest";
import { computeLineDeliveryFields, contentIndicatesNoLongerNeeded } from "@hoanggia/db";

describe("computeLineDeliveryFields", () => {
  it("cộng phần giao qua Phiếu đi hàng lên trên nền từ file PO tracking", () => {
    const result = computeLineDeliveryFields(
      { poValue: 1_000_000, poQuantity: 100, baselineDeliveredValue: 400_000, baselineDeliveredQty: 40, baselineClosed: false, manuallyClosed: false },
      { qty: 20, value: 200_000 }
    );
    expect(result).toEqual({
      deliveredValue: 600_000,
      remainingValue: 400_000,
      totalDeliveredQty: 60,
      remainingQty: 40,
      statusRaw: "Đang thực hiện",
    });
  });

  it("chuyển 'Kết thúc' khi tổng SL đã giao (nền + Phiếu đi hàng) đạt SL PO", () => {
    const result = computeLineDeliveryFields(
      { poValue: 1_000_000, poQuantity: 100, baselineDeliveredValue: 400_000, baselineDeliveredQty: 80, baselineClosed: false, manuallyClosed: false },
      { qty: 20, value: 200_000 }
    );
    expect(result.totalDeliveredQty).toBe(100);
    expect(result.remainingQty).toBe(0);
    expect(result.statusRaw).toBe("Kết thúc");
  });

  it("dùng giá trị làm ngưỡng khi dòng PO không có SL PO (poQuantity null)", () => {
    const result = computeLineDeliveryFields(
      { poValue: 1_000_000, poQuantity: null, baselineDeliveredValue: 900_000, baselineDeliveredQty: null, baselineClosed: false, manuallyClosed: false },
      { qty: 5, value: 150_000 }
    );
    expect(result.deliveredValue).toBe(1_050_000);
    expect(result.remainingValue).toBe(0); // kẹp về 0, không âm
    expect(result.remainingQty).toBeNull();
    expect(result.statusRaw).toBe("Kết thúc");
  });

  it("giữ 'Kết thúc' nếu file PO tracking đã báo đóng (baselineClosed), dù chưa cộng đủ SL/giá trị", () => {
    const result = computeLineDeliveryFields(
      { poValue: 1_000_000, poQuantity: 100, baselineDeliveredValue: 300_000, baselineDeliveredQty: 30, baselineClosed: true, manuallyClosed: false },
      { qty: 0, value: 0 }
    );
    expect(result.statusRaw).toBe("Kết thúc");
    expect(result.remainingValue).toBe(700_000); // vẫn tính đúng còn lại, chỉ trạng thái là đóng
  });

  it("giữ 'Kết thúc' nếu đã bấm nút Kết thúc đơn (manuallyClosed), dù chưa giao đủ SL/giá trị và file gốc chưa báo đóng", () => {
    const result = computeLineDeliveryFields(
      { poValue: 1_000_000, poQuantity: 100, baselineDeliveredValue: 300_000, baselineDeliveredQty: 30, baselineClosed: false, manuallyClosed: true },
      { qty: 0, value: 0 }
    );
    expect(result.statusRaw).toBe("Kết thúc");
    expect(result.remainingValue).toBe(700_000); // vẫn tính đúng còn lại, chỉ trạng thái là đóng
    expect(result.remainingQty).toBe(70);
  });

  it("không có đóng góp từ Phiếu đi hàng thì kết quả = đúng nguyên nền", () => {
    const result = computeLineDeliveryFields(
      { poValue: 1_000_000, poQuantity: 100, baselineDeliveredValue: 1_000_000, baselineDeliveredQty: 100, baselineClosed: true, manuallyClosed: false },
      { qty: 0, value: 0 }
    );
    expect(result).toEqual({
      deliveredValue: 1_000_000,
      remainingValue: 0,
      totalDeliveredQty: 100,
      remainingQty: 0,
      statusRaw: "Kết thúc",
    });
  });

  it("tự chuyển 'Kết thúc' khi hết giá trị còn lại (remainingValue = 0), kể cả khi SL PO chưa khớp đúng số đã giao", () => {
    const result = computeLineDeliveryFields(
      { poValue: 1_000_000, poQuantity: 100, baselineDeliveredValue: 1_000_000, baselineDeliveredQty: 90, baselineClosed: false, manuallyClosed: false },
      { qty: 0, value: 0 }
    );
    expect(result.remainingValue).toBe(0);
    expect(result.totalDeliveredQty).toBe(90); // vẫn còn lệch 10 so với SL PO
    expect(result.statusRaw).toBe("Kết thúc"); // nhưng hết giá trị chưa giao thì vẫn coi là xong
  });
});

describe("contentIndicatesNoLongerNeeded", () => {
  it("nhận diện 'Huỷ' và 'Kết thúc' viết hoa/thường, có/không dấu câu kèm theo", () => {
    expect(contentIndicatesNoLongerNeeded("Huỷ")).toBe(true);
    expect(contentIndicatesNoLongerNeeded("hủy")).toBe(true); // cách gõ dấu khác, cùng nghĩa
    expect(contentIndicatesNoLongerNeeded("KH huỷ 50sp còn lại")).toBe(true);
    expect(contentIndicatesNoLongerNeeded("Kết thúc")).toBe(true);
    expect(contentIndicatesNoLongerNeeded("Đơn đã kết thúc, không giao nữa")).toBe(true);
  });

  it("không khớp nhầm các ghi chú khác không liên quan", () => {
    expect(contentIndicatesNoLongerNeeded("Để tồn")).toBe(false);
    expect(contentIndicatesNoLongerNeeded("T08")).toBe(false);
    expect(contentIndicatesNoLongerNeeded("Kết chuyển sang PO khác")).toBe(false); // "kết" không đi liền "thúc"
    expect(contentIndicatesNoLongerNeeded(null)).toBe(false);
    expect(contentIndicatesNoLongerNeeded("")).toBe(false);
  });
});
