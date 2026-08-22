import { describe, it, expect } from "vitest";
import { computeLineDeliveryFields, contentIndicatesNoLongerNeeded, allocateQtyAcrossLines } from "@hoanggia/db";

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

describe("allocateQtyAcrossLines", () => {
  it("dòng đầu nhận đủ phần còn thiếu trước, dư mới sang dòng sau (trừ dần lần lượt)", () => {
    const result = allocateQtyAcrossLines(6, [
      { lineId: "A", capacity: 5 },
      { lineId: "B", capacity: 3 },
      { lineId: "C", capacity: 10 },
    ]);
    expect(result).toEqual([
      { lineId: "A", qty: 5 },
      { lineId: "B", qty: 1 },
    ]);
  });

  it("đủ cho dòng đầu thì không đụng tới các dòng sau", () => {
    const result = allocateQtyAcrossLines(5, [
      { lineId: "A", capacity: 5 },
      { lineId: "B", capacity: 3 },
    ]);
    expect(result).toEqual([{ lineId: "A", qty: 5 }]);
  });

  it("bỏ qua dòng đã hết capacity (0 hoặc âm), không tạo phân bổ 0", () => {
    const result = allocateQtyAcrossLines(4, [
      { lineId: "A", capacity: 0 },
      { lineId: "B", capacity: -2 },
      { lineId: "C", capacity: 10 },
    ]);
    expect(result).toEqual([{ lineId: "C", qty: 4 }]);
  });

  it("SL giao vượt tổng capacity mọi dòng — phần dư dồn hết vào dòng CUỐI CÙNG, không mất số liệu", () => {
    const result = allocateQtyAcrossLines(25, [
      { lineId: "A", capacity: 5 },
      { lineId: "B", capacity: 3 },
      { lineId: "C", capacity: 10 },
    ]);
    expect(result).toEqual([
      { lineId: "A", qty: 5 },
      { lineId: "B", qty: 3 },
      { lineId: "C", qty: 17 }, // 10 (capacity) + 7 (dư) — dòng cuối không bị chặn ở capacity
    ]);
    expect(result.reduce((s, r) => s + r.qty, 0)).toBe(25);
  });

  it("chỉ 1 dòng — nhận trọn vẹn (kể cả vượt capacity, dồn hết vào vì là dòng cuối)", () => {
    const result = allocateQtyAcrossLines(8, [{ lineId: "A", capacity: 5 }]);
    expect(result).toEqual([{ lineId: "A", qty: 8 }]);
  });
});
