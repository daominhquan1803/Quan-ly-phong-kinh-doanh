import { stripItemCodeVersionSuffix } from "@hoanggia/db";

// Ghép dòng PO của app với lệnh sản xuất (LSX) theo Số PO + mã hàng, và suy ra tiến độ.
export interface LsxRow {
  lsxNo: string;
  poCodes: string[];
  itemCode: string;
  customerName: string | null;
  done: boolean;
  hasProgress: boolean;
  runningOn: string | null;
  currentStages: string | null;
  plannedMachine: string | null;
  completedOn: Date | null;
  plannedShipOn: Date | null;
  plannedShipTime: string | null;
  hideAutoPlan: boolean;
}

export type ProductionStatus = "WAITING" | "RUNNING" | "DONE" | "NO_LSX" | "OLD_PO" | "TRADING" | "OTHER";
export type ProductionAlert = "LATE" | "AT_RISK" | "DONE_NOT_SHIPPED";

/** Mã đầu SI, SB, GC là hàng sản xuất; AA, ST là hàng thương mại (anh Quân xác nhận 27/11/2026). */
export const isProductionCode = (code: string | null) => /^(SI|SB|GC)/i.test(code ?? "");
export const isTradingCode = (code: string | null) => /^(AA|ST)/i.test(code ?? "");

const AT_RISK_DAYS = 3;
// Sao chép quy tắc "dự kiến xong" của trang sản xuất: đang ở công đoạn cuối thì dự kiến xong ngày mai.
const AUTO_ETA: Record<string, string> = { donggoi: "09:00", catto: "10:00", xeqc: "12:00" };

const upper = (s: string) => s.trim().toUpperCase();
const base = (s: string) => stripItemCodeVersionSuffix(upper(s));
// Mã phòng nằm trong Số PO: "D11.26DT01A" -> "DT".
const deptOf = (poCode: string) => /^D\d{2}\.\d{2}([A-Z]+)/.exec(upper(poCode))?.[1];
const stageKey = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function findLsx<T extends LsxRow>(line: { poCode: string; itemCode: string | null }, rows: T[]): T[] {
  if (!line.itemCode) return [];
  const samePo = rows.filter((r) => r.poCodes.some((p) => upper(p) === upper(line.poCode)));
  const exact = samePo.filter((r) => upper(r.itemCode) === upper(line.itemCode!));
  return exact.length ? exact : samePo.filter((r) => base(r.itemCode) === base(line.itemCode!));
}

function etaOf(row: LsxRow, tomorrow: string): { date: string; time: string } | null {
  if (row.plannedShipOn) return { date: isoDay(row.plannedShipOn), time: row.plannedShipTime ?? "12:00" };
  if (row.hideAutoPlan) return null;
  const times = (row.currentStages ?? row.plannedMachine ?? "").split(",").map((s) => AUTO_ETA[stageKey(s)]).filter(Boolean).sort();
  return times[0] ? { date: tomorrow, time: times[0] } : null;
}

// Ngày theo giờ Việt Nam: ngày PO lưu lúc 00:00 giờ VN là 17:00 hôm trước theo UTC.
const vnDay = (d: Date) => isoDay(new Date(d.getTime() + 7 * 3_600_000));

/**
 * Tiến độ của 1 dòng PO còn nợ hàng. Nhiều lệnh -> lấy trạng thái và ngày dự kiến CHẬM nhất.
 * `dataSince` = ngày lệnh sớm nhất bên trang sản xuất: PO đặt trước đó mà không có lệnh thì không biết tiến độ,
 * không báo "chưa có lệnh"/"trễ".
 */
export function progressFor(
  line: { poCode: string; itemCode: string | null; poDate?: Date | null },
  rows: LsxRow[],
  daysLeft: number | null,
  tomorrow: string,
  dataSince: Date | null = null
) {
  const lsx = findLsx(line, rows);
  const unfinished = lsx.filter((r) => !r.done);
  const beforeData = Boolean(dataSince && line.poDate && vnDay(line.poDate) < vnDay(dataSince));
  const status: ProductionStatus = isTradingCode(line.itemCode)
    ? "TRADING"
    : lsx.length
      ? unfinished.some((r) => !r.hasProgress)
        ? "WAITING"
        : unfinished.length
          ? "RUNNING"
          : "DONE"
      : isProductionCode(line.itemCode)
        ? beforeData
          ? "OLD_PO"
          : "NO_LSX"
        : "OTHER";

  const notStarted = status === "WAITING" || status === "NO_LSX";
  let alert: ProductionAlert | null = null;
  if (status === "DONE") alert = "DONE_NOT_SHIPPED";
  else if ((notStarted || status === "RUNNING") && daysLeft != null && daysLeft < 0) alert = "LATE";
  else if (notStarted && daysLeft != null && daysLeft <= AT_RISK_DAYS) alert = "AT_RISK";

  const etas = unfinished.map((r) => etaOf(r, tomorrow));
  const eta = etas.length && etas.every(Boolean) ? [...etas].sort((a, b) => `${b!.date} ${b!.time}`.localeCompare(`${a!.date} ${a!.time}`))[0] : null;
  const stages = unfinished.map((r) => (r.runningOn ? `Đang chạy ${r.runningOn}` : r.hasProgress ? r.currentStages : r.plannedMachine && `Dự kiến máy ${r.plannedMachine}`));
  const completed = status === "DONE" ? lsx.map((r) => r.completedOn).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null : null;

  return {
    status,
    alert,
    eta,
    stage: [...new Set(stages.filter(Boolean))].join(" · ") || null,
    lsxNos: [...new Set(lsx.map((r) => r.lsxNo))],
    completedOn: completed,
  };
}

/** Lệnh chưa xong của phòng mình (mã phòng đã có trong PO của NVKD đang quản lý) nhưng không khớp dòng PO nào. */
export function unmatchedLsx<T extends LsxRow>(lines: { poCode: string; itemCode: string | null; hasSalesEmployee: boolean }[], rows: T[]): T[] {
  const used = new Set(lines.flatMap((l) => findLsx(l, rows)));
  const depts = new Set(lines.filter((l) => l.hasSalesEmployee).map((l) => deptOf(l.poCode)).filter(Boolean));
  return rows.filter((r) => !used.has(r) && !r.done && r.poCodes.some((p) => depts.has(deptOf(p))));
}
