import { describe, it, expect } from "vitest";
import { computeLineDeliveryFields, contentIndicatesNoLongerNeeded, allocateQtyAcrossLines, excessBeyondBaseline, isSampleNote, isSampleMapping, isSampleOrder, isStaleLineToClose } from "@hoanggia/db";

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

describe("excessBeyondBaseline (phiếu trước mốc nhập file PO tracking)", () => {
  it("file đã ghi 20.000 (phiếu 23/09), phiếu 28/09 giao 35.000 -> tính đủ 35.000", () => {
    expect(excessBeyondBaseline(20000, 35000, 20000)).toBe(35000);
  });
  it("phiếu sớm nhất nằm trong nền -> không tính thêm", () => {
    expect(excessBeyondBaseline(0, 20000, 20000)).toBe(0);
  });
  it("nền phủ 1 phần phiếu -> chỉ tính phần vượt", () => {
    expect(excessBeyondBaseline(10000, 30000, 30000)).toBe(10000);
  });
  it("file đã ghi đủ cả 2 phiếu -> không tính thêm", () => {
    expect(excessBeyondBaseline(30000, 30000, 60000)).toBe(0);
  });
});

describe("hàng mẫu không tính doanh số", () => {
  it("nhận diện ghi chú Hàng mẫu, không nhầm quy cách kỹ thuật hay tên sản phẩm", () => {
    expect(isSampleNote("Hàng mẫu")).toBe(true);
    expect(isSampleNote("HÀNG MẪU")).toBe(true);
    expect(isSampleNote("Mẫu")).toBe(true);
    expect(isSampleNote("4 tem 1 tờ, 400 tem/ bọc. Hàng Mẫu")).toBe(true);
    expect(isSampleNote("Túi PE 37cm x 58cm 51471 (hàng mẫu không tính tiền)")).toBe(true);
    expect(isSampleNote("PO OCA MS THUÝ SAMPLE")).toBe(true);
    expect(isSampleNote("Quyển mẫu màu tôn 139mmx265mm")).toBe(false);
    expect(isSampleNote("Nhãn giấy Nhãn dán lưu mẫu 100mmx50mm")).toBe(false);
    expect(isSampleNote("Lưu ý: túi mở 2 đầu. có mẫu gửi kèm theo")).toBe(false);
    // FOC bù hao cũng không tính doanh số\n    expect(isSampleNote("FOC-Bù Hao-VNPTTech/145/26")).toBe(true);\n    expect(isSampleNote("K5BXKQ4M000203EF- BÙ HAO-FOC")).toBe(true);\n    expect(isSampleNote("VNPTTech/071/26\nBÙ HAO")).toBe(true);\n    expect(isSampleNote("hàng bù hao")).toBe(true);\n    expect(isSampleNote("Chú ý sx đủ, không thiếu, dư thì bù hao.")).toBe(false);\n    expect(isSampleNote("Tờ HDSD ANTIFREEZE INSTRUCTION C")).toBe(false);
    expect(isSampleNote(null)).toBe(false);
  });
  it("dòng AMIS: ghi chú nằm ở custom_field3/4/6/7; quy cách (custom_field5) không tính", () => {
    expect(isSampleMapping({ custom_field4: "Hàng mẫu" })).toBe(true);
    expect(isSampleMapping({ custom_field3: "Hàng mẫu" })).toBe(true);
    expect(isSampleMapping({ custom_field4: "AWW9288CMNC0-0C0" })).toBe(false);
    expect(isSampleOrder({ sale_order_name: "Hàng Mẫu không tính tiền" })).toBe(true);
    expect(isSampleOrder({ sale_order_name: "Đơn hàng bán cho PANASONIC" })).toBe(false);
  });
  it("dòng mẫu giá trị 0 vẫn không tự 'Kết thúc' khi chưa giao đủ SL", () => {
    const line = { poValue: 0, poQuantity: 10, baselineDeliveredValue: 0, baselineDeliveredQty: 0, baselineClosed: false, manuallyClosed: false };
    expect(computeLineDeliveryFields({ ...line, isSample: true }, { qty: 0, value: 0 }).statusRaw).toBe("Đang thực hiện");
    expect(computeLineDeliveryFields({ ...line, isSample: true }, { qty: 10, value: 0 }).statusRaw).toBe("Kết thúc");
    expect(computeLineDeliveryFields(line, { qty: 0, value: 0 }).statusRaw).toBe("Kết thúc"); // dòng thường giá 0 như cũ
  });
});
describe("isStaleLineToClose — dòng mã cũ sót lại, chưa giao gì thì đóng", () => {
  const base = { manuallyClosed: false, baselineClosed: false, baselineDeliveredQty: 0, baselineDeliveredValue: 0 };
  it("chưa giao gì → đóng", () => {
    expect(isStaleLineToClose(base, { qty: 0, value: 0 })).toBe(true);
    expect(isStaleLineToClose({ ...base, baselineDeliveredQty: null }, { qty: 0, value: 0 })).toBe(true);
  });
  it("đã có giao hàng (baseline hoặc phiếu) → KHÔNG tự đóng, để người rà soát", () => {
    expect(isStaleLineToClose({ ...base, baselineDeliveredQty: 10, baselineDeliveredValue: 1000 }, { qty: 0, value: 0 })).toBe(false);
    expect(isStaleLineToClose(base, { qty: 5, value: 500 })).toBe(false);
  });
  it("đã đóng rồi thì bỏ qua", () => {
    expect(isStaleLineToClose({ ...base, manuallyClosed: true }, { qty: 0, value: 0 })).toBe(false);
    expect(isStaleLineToClose({ ...base, baselineClosed: true }, { qty: 0, value: 0 })).toBe(false);
  });
});
