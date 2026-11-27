import { stripItemCodeVersionSuffix } from "@hoanggia/db";

// Ghép dòng PO của app với lệnh sản xuất (LSX) theo Số PO + mã hàng.
export interface LsxRow {
  lsxNo: string;
  poCodes: string[];
  itemCode: string;
  customerName: string | null;
  done: boolean;
}

export interface PoLine {
  poCode: string;
  itemCode: string | null;
  open: boolean;
  hasSalesEmployee: boolean;
}

/** Mã đầu SI, SB, GC là hàng sản xuất; AA, ST là hàng thương mại (anh Quân xác nhận 27/11/2026). */
export const isProductionCode = (code: string | null) => /^(SI|SB|GC)/i.test(code ?? "");
export const isTradingCode = (code: string | null) => /^(AA|ST)/i.test(code ?? "");

const upper = (s: string) => s.trim().toUpperCase();
const base = (s: string) => stripItemCodeVersionSuffix(upper(s));
// Mã phòng nằm trong Số PO: "D11.26DT01A" -> "DT".
const deptOf = (poCode: string) => /^D\d{2}\.\d{2}([A-Z]+)/.exec(upper(poCode))?.[1];

export function findLsx<T extends LsxRow>(line: { poCode: string; itemCode: string | null }, rows: T[]): T[] {
  if (!line.itemCode) return [];
  const samePo = rows.filter((r) => r.poCodes.some((p) => upper(p) === upper(line.poCode)));
  const exact = samePo.filter((r) => upper(r.itemCode) === upper(line.itemCode!));
  return exact.length ? exact : samePo.filter((r) => base(r.itemCode) === base(line.itemCode!));
}

export function matchReport<L extends PoLine, T extends LsxRow>(lines: L[], rows: T[]) {
  const production = lines.filter((l) => l.open && isProductionCode(l.itemCode));
  const withoutLsx = production.filter((l) => findLsx(l, rows).length === 0);

  const used = new Set(lines.flatMap((l) => findLsx(l, rows)));
  // Chỉ báo LSX của phòng mình (mã phòng đã có trong PO của NVKD đang quản lý), phòng khác bỏ qua.
  const depts = new Set(lines.filter((l) => l.hasSalesEmployee).map((l) => deptOf(l.poCode)).filter(Boolean));
  const unmatchedLsx = rows.filter((r) => !used.has(r) && !r.done && r.poCodes.some((p) => depts.has(deptOf(p))));

  return {
    openProduction: production.length,
    matched: production.length - withoutLsx.length,
    trading: lines.filter((l) => l.open && isTradingCode(l.itemCode)).length,
    withoutLsx,
    unmatchedLsx,
  };
}
