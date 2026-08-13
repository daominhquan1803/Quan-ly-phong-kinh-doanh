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

/** Định nghĩa field chung — dùng để tái sử dụng gợi ý mapping cho các loại import khác
 * (đơn hàng, kế hoạch kinh doanh...) ngoài OrderFieldDef. */
export interface FieldDef<K extends string = string> {
  key: K;
  label: string;
  required: boolean;
  synonyms: string[];
}

/** Hash tập header (đã chuẩn hoá, sắp xếp) để nhận diện lại cùng 1 định dạng file lần sau. */
export function hashHeaders(headers: string[]): string {
  const normalized = headers.map(normalizeVN).sort().join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Gợi ý mapping field hệ thống -> tên cột Excel, dựa trên fuzzy match với synonyms.
 * Gán loại trừ theo kiểu "ghép cặp điểm cao nhất trước" (global greedy): xét mọi cặp
 * (field, cột) đạt ngưỡng, ưu tiên ghép cặp có điểm khớp cao nhất trước — tránh trường
 * hợp 1 field khớp mơ hồ (điểm thấp) "cướp" mất 1 cột trước khi field khớp chính xác hơn
 * (điểm cao) kịp xét tới (vd "Ngày đặt hàng" vs cột "Ngày giao hàng" có điểm thấp hơn
 * "Ngày giao dự kiến" vs chính cột đó, nên cột phải thuộc về field sau).
 */
export function suggestMapping<K extends string = OrderFieldKey>(
  headers: string[],
  fields: FieldDef<K>[] = ORDER_FIELDS as unknown as FieldDef<K>[]
): Partial<Record<K, string>> {
  const candidates: { key: K; header: string; score: number }[] = [];
  for (const field of fields) {
    for (const header of headers) {
      let score = 0;
      for (const syn of field.synonyms) {
        score = Math.max(score, similarity(header, syn));
      }
      if (score >= 0.5) candidates.push({ key: field.key, header, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const mapping: Partial<Record<K, string>> = {};
  const usedHeaders = new Set<string>();
  for (const c of candidates) {
    if (mapping[c.key] || usedHeaders.has(c.header)) continue;
    mapping[c.key] = c.header;
    usedHeaders.add(c.header);
  }
  return mapping;
}
