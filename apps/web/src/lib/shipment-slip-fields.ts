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

export const SHIPMENT_SLIP_FIELDS: FieldDef<ShipmentSlipFieldKey>[] = [
  {
    key: "slipNumber",
    label: "Số phiếu",
    required: true,
    synonyms: ["số phiếu", "số", "so phieu", "slip number", "mã phiếu"],
  },
  {
    key: "slipDate",
    label: "Ngày lập phiếu",
    required: false,
    synonyms: ["ngày lập phiếu", "ngày", "ngay lap phieu", "slip date"],
  },
  {
    key: "receiverName",
    label: "Người nhận hàng",
    required: false,
    synonyms: ["người nhận hàng", "nguoi nhan hang", "receiver"],
  },
  {
    key: "customerName",
    label: "Khách hàng",
    required: false,
    synonyms: ["khách hàng", "tên khách hàng", "customer", "ten khach hang"],
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
    label: "Số PO bán",
    required: false,
    synonyms: ["số po bán", "số po", "so po ban", "po sale number", "mã đơn hàng"],
  },
  {
    key: "unit",
    label: "ĐVT",
    required: false,
    synonyms: ["đvt", "đơn vị tính", "don vi tinh", "unit"],
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
    required: false,
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
