/**
 * Quy đổi 1 báo giá của APP BÁO GIÁ (royalps, SQLite) sang dòng QuoteRequest của hệ thống này. Thuần hàm (không chạm DB)
 * để kiểm thử được; việc đọc file + ghi DB nằm ở baoGiaApp.ts.
 */

// Từ 10/10/2026 cả phòng nhập báo giá vào app báo giá; báo giá TRƯỚC ngày này vẫn lấy từ Google Sheet.
export const QUOTE_APP_CUTOFF = { year: 2026, month: 10, day: 10 };

/** 00:00 giờ Việt Nam của ngày cutoff, tính bằng mili giây epoch. */
export function cutoffMs(): number {
  const { year, month, day } = QUOTE_APP_CUTOFF;
  return Date.UTC(year, month - 1, day) - 7 * 3600_000;
}

/** Dòng Google Sheet (year/month/requestDay) có thuộc giai đoạn dùng app báo giá không (từ ngày cutoff trở đi). */
export function isOnOrAfterCutoff(year: number, month: number, requestDay: number | null): boolean {
  if (requestDay == null) return false;
  const { year: cy, month: cm, day: cd } = QUOTE_APP_CUTOFF;
  return Date.UTC(year, month - 1, requestDay) >= Date.UTC(cy, cm - 1, cd);
}

export type MappedQuoteStatus = "WON" | "NEGOTIATING" | "LOST" | "NOT_QUOTED";

const LOST_RESULTS = new Set(["KHACH_CHE_DAT", "DOI_THU_RE_HON", "KHACH_DOI_MAU", "HUY_KHAC"]);

/**
 * 4 nhóm trạng thái hiển thị: chốt được giá / đang thương thảo / không bán được / chưa báo giá.
 * Ưu tiên: chốt PO -> huỷ/thua -> chưa báo giá -> còn lại là đang thương thảo (đã báo giá L1/L2, khách phản hồi, báo giá một phần).
 */
export function mapAppStatus(status: string, finalResult: string | null): MappedQuoteStatus {
  if (finalResult === "CHOT_PO" || status === "DA_CHOT_PO") return "WON";
  if (status === "DA_HUY" || (finalResult != null && LOST_RESULTS.has(finalResult))) return "LOST";
  if (status === "CHO_BAO_GIA" || status === "DANG_TINH_GIA") return "NOT_QUOTED";
  return "NEGOTIATING";
}

/** Ngày-tháng-năm theo GIỜ VIỆT NAM từ mili giây epoch (app báo giá lưu DateTime dạng số mili giây). */
export function vnDateParts(ms: number): { year: number; month: number; day: number } {
  const d = new Date(ms + 7 * 3600_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export interface AppQuoteRow {
  code: string;
  status: string;
  finalResult: string | null;
  requestedAt: number;
  updatedAt: number;
  notes: string | null;
  deliveryAddress: string | null;
  potentialItems: string | null;
  customerName: string;
  customerType: string | null;
  customerIndustry: string | null;
  customerNationality: string | null;
  customerScale: string | null;
  customerAddress: string | null;
  salesUsername: string;
  pkhName: string | null;
}

export interface AppQuoteItem {
  itemName: string;
  quantity: number;
  unit: string;
  unitPriceL1: number | null;
  unitPriceL2: number | null;
  feedbackL1: string | null;
  feedbackL2: string | null;
}

const clip = (s: string | null | undefined, max = 500): string | null => {
  const t = (s ?? "").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const num = (n: number): string => new Intl.NumberFormat("vi-VN").format(n);
const join = (parts: (string | null)[], sep = "; "): string | null => clip(parts.filter(Boolean).join(sep));

/**
 * `assigneeCodeFor(username)` trả mã "Phụ trách" chuẩn của hệ thống (User.quoteAssigneeCode, vd "TAN.DV") để điểm
 * "Số báo giá mới" của Kế hoạch tuần khớp đúng nhân viên; không khớp ai thì dùng tên đăng nhập viết hoa.
 */
export function mapAppQuote(row: AppQuoteRow, items: AppQuoteItem[], assigneeCodeFor: (username: string) => string) {
  const at = vnDateParts(row.requestedAt);
  const units = Array.from(new Set(items.map((i) => i.unit).filter(Boolean)));
  return {
    sourceApp: "BAOGIA_APP" as const,
    sourceCode: row.code,
    sourceUpdatedAt: new Date(row.updatedAt),
    requestedAt: new Date(row.requestedAt),
    statusRaw: row.status,
    finalResult: row.finalResult,
    status: mapAppStatus(row.status, row.finalResult),
    year: at.year,
    month: at.month,
    requestDay: at.day,
    assigneeRaw: assigneeCodeFor(row.salesUsername),
    customerName: row.customerName,
    customerField: clip(row.customerIndustry),
    customerType: clip(row.customerType),
    companyNationality: clip(row.customerNationality),
    scale: clip(row.customerScale),
    productInterest: join(items.map((i) => clip(i.itemName, 120))),
    quantity: join(items.map((i) => num(i.quantity)), " / "),
    unit: units.length ? clip(units.join(" / "), 60) : null,
    potentialItems: clip(row.potentialItems),
    deliveryAddress: clip(row.deliveryAddress ?? row.customerAddress),
    pricingStaff: clip(row.pkhName, 120),
    quoteL1: join(items.filter((i) => i.unitPriceL1 != null).map((i) => `${clip(i.itemName, 60)}: ${num(i.unitPriceL1 as number)}`)),
    feedbackL1: join(items.map((i) => clip(i.feedbackL1, 120))),
    quoteL2: join(items.filter((i) => i.unitPriceL2 != null).map((i) => `${clip(i.itemName, 60)}: ${num(i.unitPriceL2 as number)}`)),
    feedbackL2: join(items.map((i) => clip(i.feedbackL2, 120))),
    note: clip(row.notes, 1000),
    sourceColorHex: null,
    sourceSheetName: "App báo giá",
    sourceRowNumber: 0,
  };
}
