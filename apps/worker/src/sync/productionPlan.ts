import { prisma } from "@hoanggia/db";
import { logger } from "../logger";

// Đọc lệnh sản xuất từ trang "Hoàng Gia Lệnh SX". CHỈ đăng nhập và đọc /api/lsx — không ghi gì sang đó
// (các đường dẫn khác như /api/cfg không được gọi).
const BASE_URL = () => (process.env.LENHSX_URL || "https://103-161-16-246.sslip.io").replace(/\/$/, "");

export const isProductionPlanConfigured = () => Boolean(process.env.LENHSX_USER && process.env.LENHSX_PASSWORD);

interface Lsx {
  ma?: string;
  soPO?: string;
  maHang?: string;
  codes?: { ma?: string }[];
  khach?: string;
  slYeuCau?: number;
  ngayLenh?: string;
  ngayGiao?: string;
  done?: boolean;
  ngayHT?: string;
  huy?: boolean;
  runningOn?: string;
  mayList?: string[];
  mayKH?: string;
  journeyLog?: unknown[];
  uuTien?: string;
  gh?: { dk?: { ngay?: string; gio?: string }; anDk?: boolean; da?: boolean; bo?: boolean };
}

/** "dd/mm/yyyy" hoặc "yyyy-mm-dd"; sai dạng -> null. */
function parseDate(s: string | undefined): Date | null {
  const vn = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s?.trim() ?? "");
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s?.trim() ?? "");
  if (!vn && !iso) return null;
  const [y, m, d] = vn ? [+vn[3], +vn[2], +vn[1]] : [+iso![1], +iso![2], +iso![3]];
  return new Date(Date.UTC(y, m - 1, d));
}

const split = (s: string | undefined) => (s ?? "").split(/[+,;\n]/).map((x) => x.trim()).filter(Boolean);

export function parseProductionRecords(records: { id: string; data: { j: unknown } }[]) {
  return records.flatMap((record) => {
    const x = (typeof record.data?.j === "string" ? JSON.parse(record.data.j) : record.data?.j) as Lsx | undefined;
    if (!x || x.huy) return [];
    const poCodes = split(x.soPO);
    const fromCodes = (x.codes ?? []).map((c) => c.ma?.trim() ?? "").filter(Boolean);
    const itemCodes = [...new Set(fromCodes.length ? fromCodes : split(x.maHang))];
    if (!poCodes.length) return [];
    return itemCodes.map((itemCode, i) => ({
      id: `${record.id}#${i}`,
      lsxNo: String(x.ma ?? record.id),
      poCodes,
      itemCode,
      customerName: x.khach || null,
      quantity: Number.isFinite(x.slYeuCau) ? x.slYeuCau! : null,
      orderedOn: parseDate(x.ngayLenh),
      dueOn: parseDate(x.ngayGiao),
      done: Boolean(x.done),
      completedOn: parseDate(x.ngayHT),
      runningOn: x.runningOn || null,
      currentStages: x.mayList?.join(", ") || null,
      plannedMachine: x.mayKH || null,
      hasProgress: Boolean(x.runningOn || x.journeyLog?.length),
      priority: x.uuTien ? String(x.uuTien) : null,
      plannedShipOn: parseDate(x.gh?.dk?.ngay),
      plannedShipTime: x.gh?.dk?.gio || null,
      hideAutoPlan: Boolean(x.gh?.anDk || x.gh?.da || x.gh?.bo),
    }));
  });
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL()}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ u: process.env.LENHSX_USER!, p: process.env.LENHSX_PASSWORD! }).toString(),
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error(`Đăng nhập trang Lệnh SX thất bại (mã ${res.status}) — kiểm tra LENHSX_USER / LENHSX_PASSWORD.`);
  return cookie;
}

/** Thay toàn bộ bảng production_lines. Lỗi hoặc dữ liệu rỗng -> ném lỗi, giữ nguyên số liệu cũ. */
export async function runProductionPlanSync(): Promise<number> {
  const cookie = await login();
  const res = await fetch(`${BASE_URL()}/api/lsx`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Đọc lệnh sản xuất thất bại (mã ${res.status})`);
  const rows = parseProductionRecords((await res.json()) as { id: string; data: { j: unknown } }[]);
  if (!rows.length) throw new Error("Dữ liệu lệnh sản xuất rỗng — giữ nguyên số liệu cũ.");
  await prisma.$transaction([prisma.productionLine.deleteMany(), prisma.productionLine.createMany({ data: rows })]);
  logger.info(`Đồng bộ lệnh sản xuất: ${rows.length} dòng.`);
  return rows.length;
}
