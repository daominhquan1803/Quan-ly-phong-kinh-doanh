import { stripItemCodeVersionSuffix } from "@hoanggia/db";

/** Mã hàng lỗi còn trong biên bản đang mở + số đã đổi (cộng dồn các DefectReplacement). */
export interface OpenDefectItem {
  defectReportId: string;
  reportNumber: string;
  customerName: string | null;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  defectQty: number;
  replacedQty: number;
}
export interface DefectCandidate extends OpenDefectItem {
  remaining: number;
  sameCustomer: boolean;
}

const MAX_CANDIDATES = 6;
const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Biên bản mở còn thiếu có cùng mã hàng (bỏ hậu tố .N) hoặc cùng tên với dòng phiếu; cùng khách xếp trước. Admin chọn biên bản đúng. */
export function findDefectCandidates(slip: { itemCode: string | null; itemName: string; customerName: string | null }, open: OpenDefectItem[]): DefectCandidate[] {
  const code = slip.itemCode ? stripItemCodeVersionSuffix(slip.itemCode) : null;
  const out: DefectCandidate[] = [];
  for (const d of open) {
    const remaining = d.defectQty - d.replacedQty;
    if (remaining <= 0) continue;
    const byCode = !!code && !!d.itemCode && stripItemCodeVersionSuffix(d.itemCode) === code;
    const byName = norm(d.itemName) !== "" && norm(d.itemName) === norm(slip.itemName);
    if (!byCode && !byName) continue;
    out.push({ ...d, remaining, sameCustomer: norm(slip.customerName) !== "" && norm(slip.customerName) === norm(d.customerName) });
  }
  return out.sort((a, b) => Number(b.sameCustomer) - Number(a.sameCustomer) || a.reportNumber.localeCompare(b.reportNumber)).slice(0, MAX_CANDIDATES);
}

export const isDefectComplete = (items: { defectQty: number; replacedQty: number }[]) => items.length > 0 && items.every((i) => i.replacedQty >= i.defectQty);

export function latestDate(dates: (Date | null)[], fallback: Date): Date {
  const ds = dates.filter((d): d is Date => !!d);
  return ds.length ? new Date(Math.max(...ds.map((d) => d.getTime()))) : fallback;
}
