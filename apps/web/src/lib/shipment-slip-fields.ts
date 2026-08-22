import { FieldDef } from "./column-mapper";

// 1 dòng Excel = 1 dòng hàng của 1 phiếu — các cột "header" (slipNumber, slipDate...) lặp
// lại giống nhau trên mọi dòng cùng 1 phiếu, còn lại là cột riêng của từng dòng hàng. Khớp
// đúng cấu trúc phiếu xuất kho bán hàng thật của công ty (xem lib/shipment-slip-parser.ts).
export type ShipmentSlipFieldKey =
  | "slipNumber"
  | "slipDate"
  | "receiverName"
  | "customerName"
  | "deliveryAddress"
  | "description"
  | "paymentMethod"
  | "preparedBy"
  | "itemCode"
  | "itemName"
  | "warehouse"
  | "poSaleNumber"
  | "unit"
  | "qtyRequested"
  | "qtyActual"
  | "poCustomerItemCode"
  | "note";

// 7 cột "nhận diện" bắt buộc anh Quân xác nhận là đủ để xử lý 1 phiếu: Ngày giao hàng, Phiếu
// giao hàng, Mã/Tên khách hàng, Số PO, Mã/Tên hàng, SL thực xuất, Đơn vị — required=true ở
// đúng các field tương ứng (itemCode/itemName giữ nguyên quan hệ "1 trong 2" như cũ: itemName
// bắt buộc làm định danh chắc chắn có, itemCode tuỳ chọn để khớp chính xác hơn khi có).
export const SHIPMENT_SLIP_FIELDS: FieldDef<ShipmentSlipFieldKey>[] = [
  {
    key: "slipNumber",
    label: "Phiếu giao hàng (Số phiếu)",
    required: true,
    synonyms: ["phiếu giao hàng", "phieu giao hang", "số phiếu", "số", "so phieu", "slip number", "mã phiếu"],
  },
  {
    key: "slipDate",
    label: "Ngày giao hàng",
    required: true,
    synonyms: ["ngày giao hàng", "ngay giao hang", "delivery date", "ngày lập phiếu", "ngày", "ngay lap phieu", "slip date"],
  },
  {
    key: "receiverName",
    label: "Người nhận hàng",
    required: false,
    synonyms: ["người nhận hàng", "nguoi nhan hang", "receiver"],
  },
  {
    key: "customerName",
    label: "Khách hàng (Mã hoặc Tên)",
    required: true,
    synonyms: ["mã khách hàng", "ma khach hang", "khách hàng", "tên khách hàng", "customer", "ten khach hang"],
  },
  {
    key: "deliveryAddress",
    label: "Địa chỉ giao hàng",
    required: false,
    synonyms: ["địa chỉ giao hàng", "địa chỉ", "dia chi giao hang", "delivery address"],
  },
  {
    key: "description",
    label: "Diễn giải",
    required: false,
    synonyms: ["diễn giải", "dien giai", "nội dung", "description"],
  },
  {
    key: "paymentMethod",
    label: "Hình thức thanh toán",
    required: false,
    synonyms: ["hình thức thanh toán", "hinh thuc thanh toan", "payment method"],
  },
  {
    key: "preparedBy",
    label: "Người lập phiếu",
    required: false,
    synonyms: ["người lập phiếu", "nguoi lap phieu", "prepared by"],
  },
  {
    key: "itemCode",
    label: "Mã hàng",
    required: false,
    synonyms: ["mã hàng", "ma hang", "item code"],
  },
  {
    key: "itemName",
    label: "Tên hàng",
    required: true,
    synonyms: ["tên hàng", "ten hang", "item name", "tên sản phẩm"],
  },
  {
    key: "warehouse",
    label: "Kho",
    required: false,
    synonyms: ["kho", "warehouse"],
  },
  {
    key: "poSaleNumber",
    label: "Số PO",
    required: true,
    synonyms: ["số po bán", "số po", "so po ban", "po sale number", "mã đơn hàng", "so po"],
  },
  {
    key: "unit",
    label: "Đơn vị",
    required: true,
    synonyms: ["đơn vị", "don vi", "đvt", "đơn vị tính", "don vi tinh", "unit"],
  },
  {
    key: "qtyRequested",
    label: "SL yêu cầu",
    required: false,
    synonyms: ["sl yêu cầu", "số lượng yêu cầu", "sl yeu cau", "qty requested"],
  },
  {
    key: "qtyActual",
    label: "SL thực xuất",
    required: true,
    synonyms: ["sl thực xuất", "số lượng thực xuất", "sl thuc xuat", "qty actual", "thực xuất"],
  },
  {
    key: "poCustomerItemCode",
    label: "Số PO/Mã hàng KH",
    required: false,
    synonyms: ["số po/mã hàng kh", "mã hàng kh", "po/mã hàng kh", "po customer item code"],
  },
  {
    key: "note",
    label: "Ghi chú",
    required: false,
    synonyms: ["ghi chú", "ghi chu", "note"],
  },
];

/**
 * Danh sách field bắt buộc CHƯA được map — coi Mã hàng/Tên hàng là 1 NHÓM "1 trong 2" (chỉ
 * cần map 1 trong 2 cột là đủ để xác định mã hàng, đúng theo "Mã hàng hoặc tên hàng" anh yêu
 * cầu), khác các field bắt buộc còn lại đều cần map riêng lẻ. Dùng chung cho cả wizard (khoá
 * nút Nhập) lẫn commit route (chặn phía server, phòng khi client bị qua mặt).
 */
export function getMissingRequiredShipmentSlipFields(
  mapping: Partial<Record<ShipmentSlipFieldKey, string>>
): { key: ShipmentSlipFieldKey; label: string }[] {
  const missing: { key: ShipmentSlipFieldKey; label: string }[] = [];
  for (const f of SHIPMENT_SLIP_FIELDS) {
    if (f.key === "itemCode" || f.key === "itemName") continue; // xử lý riêng bên dưới
    if (f.required && !mapping[f.key]) missing.push({ key: f.key, label: f.label });
  }
  if (!mapping.itemCode && !mapping.itemName) {
    missing.push({ key: "itemName", label: "Mã hàng hoặc Tên hàng" });
  }
  return missing;
}
