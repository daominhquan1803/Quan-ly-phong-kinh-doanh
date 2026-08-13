import { createHash } from "crypto";
import { normalizeVN, similarity } from "./text-normalize";

export type OrderFieldKey =
  | "orderCode"
  | "customerName"
  | "customerCode"
  | "salesEmployeeNameRaw"
  | "orderDate"
  | "expectedDeliveryDate"
  | "status"
  | "totalValue"
  | "poCode";

export interface OrderFieldDef {
  key: OrderFieldKey;
  label: string;
  required: boolean;
  // các tên cột thường gặp trong file xuất từ AMIS — dùng để gợi ý mapping tự động
  synonyms: string[];
}

export const ORDER_FIELDS: OrderFieldDef[] = [
  {
    key: "orderCode",
    label: "Mã đơn hàng",
    required: true,
    synonyms: ["mã đơn hàng", "số đơn hàng", "mã đơn", "so don hang", "order code"],
  },
  {
    key: "customerName",
    label: "Khách hàng",
    required: true,
    synonyms: ["khách hàng", "tên khách hàng", "customer", "ten khach hang"],
  },
  {
    key: "customerCode",
    label: "Mã khách hàng",
    required: false,
    synonyms: ["mã khách hàng", "ma khach hang", "customer code"],
  },
  {
    key: "salesEmployeeNameRaw",
    label: "Nhân viên kinh doanh",
    required: false,
    synonyms: ["nhân viên kinh doanh", "nhân viên bán hàng", "sale phụ trách", "nhan vien kinh doanh", "sales"],
  },
  {
    key: "orderDate",
    label: "Ngày đặt hàng",
    required: false,
    synonyms: ["ngày đặt hàng", "ngày lập đơn", "ngày tạo", "order date"],
  },
  {
    key: "expectedDeliveryDate",
    label: "Ngày giao dự kiến",
    required: false,
    synonyms: ["ngày giao dự kiến", "ngày giao hàng", "hạn giao hàng", "delivery date"],
  },
  {
    key: "status",
    label: "Trạng thái",
    required: false,
    synonyms: ["trạng thái", "tình trạng", "status"],
  },
  {
    key: "totalValue",
    label: "Giá trị đơn hàng",
    required: true,
    synonyms: ["giá trị đơn hàng", "thành tiền", "tổng tiền", "giá trị", "total"],
  },
  {
    key: "poCode",
    label: "PO / Mã hàng KH",
    required: false,
    synonyms: ["po", "số po", "mã hàng kh", "po/mã hàng kh", "purchase order"],
  },
];

export type ColumnMapping = Partial<Record<OrderFieldKey, string>>;

/** Hash tập header (đã chuẩn hoá, sắp xếp) để nhận diện lại cùng 1 định dạng file lần sau. */
export function hashHeaders(headers: string[]): string {
  const normalized = headers.map(normalizeVN).sort().join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

/** Gợi ý mapping field hệ thống -> tên cột Excel, dựa trên fuzzy match với synonyms. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const field of ORDER_FIELDS) {
    let best: { header: string; score: number } | null = null;
    for (const header of headers) {
      let score = 0;
      for (const syn of field.synonyms) {
        score = Math.max(score, similarity(header, syn));
      }
      if (!best || score > best.score) best = { header, score };
    }
    if (best && best.score >= 0.5) {
      mapping[field.key] = best.header;
    }
  }
  return mapping;
}
