/**
 * Lớp dữ liệu Lead quét MXH / khách tiềm năng: nhập file Excel từ Google Sheet, báo cáo, Lead MXH theo tuần trong Kế hoạch tuần.
 * Luật ghi nhận + phân loại: xem lead-scan.ts.
 */
import * as XLSX from "xlsx";
import { prisma } from "@hoanggia/db";
import {
  buildEmployeeResolver,
  buildLeadReport,
  parseLeadWorkbook,
  type LeadReport,
  type ParsedFbItem,
  type ParsedLog,
  type ParsedProspect,
} from "./lead-scan";
import { getEligibleEmployees, weekRange } from "./week-plan";

const toDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);
const toISO = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const fbData = (i: ParsedFbItem, batch: string) => ({
  scanDate: toDate(i.scanDate)!,
  postDate: toDate(i.postDate),
  platform: i.platform,
  groupName: i.groupName,
  poster: i.poster,
  product: i.product,
  quantity: i.quantity,
  area: i.area,
  contactInPost: i.contactInPost,
  link: i.link,
  contactDate: toDate(i.contactDate),
  assigneeName: i.assigneeName,
  assigneeId: i.assigneeId,
  result: i.result,
  note: i.note,
  status: i.status,
  resultKind: i.resultKind,
  missing: i.missing,
  importBatchId: batch,
});

const prospectData = (p: ParsedProspect, batch: string) => ({
  origin: p.origin,
  foundDate: toDate(p.foundDate),
  rank: p.rank,
  score: p.score,
  companyName: p.companyName,
  taxCode: p.taxCode,
  industry: p.industry,
  area: p.area,
  signal: p.signal,
  products: p.products,
  contactPerson: p.contactPerson,
  phone: p.phone,
  email: p.email,
  sourceNote: p.sourceNote,
  assigneeName: p.assigneeName,
  assigneeId: p.assigneeId,
  contactDate: toDate(p.contactDate),
  channel: p.channel,
  result: p.result,
  note: p.note,
  nextStep: p.nextStep,
  nextDate: toDate(p.nextDate),
  status: p.status,
  resultKind: p.resultKind,
  missing: p.missing,
  importBatchId: batch,
});

const logData = (l: ParsedLog) => ({ status: l.status, groups: l.groups, postsRead: l.postsRead, newPosts: l.newPosts, note: l.note });

export interface LeadImportSummary {
  sheets: { name: string; kind: string; rows: number }[];
  fb: { total: number; byStatus: Record<string, number> };
  prospects: { total: number; byStatus: Record<string, number> };
  logs: number;
  /** Tên NVKD trong sheet chưa khớp nhân viên nào (cần thêm bí danh hoặc sửa tên trong sheet). */
  unmatchedNames: string[];
}

const countBy = (xs: { status: string }[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x.status] = (m[x.status] ?? 0) + 1), m), {});

/** Nhập file Excel tải từ sheet — upsert theo khoá nguồn (sheet là nguồn gốc, nhập lại thì cập nhật). Ném Error nếu không nhận ra tab nào. */
export async function importLeadWorkbook(buffer: Buffer): Promise<LeadImportSummary> {
  // KHÔNG dùng cellDates: ô ngày đọc số serial thô rồi tự quy đổi (xem ghi chú ở api/week-plan/results/import).
  const wb = XLSX.read(buffer, { type: "buffer" });
  const [users, aliases] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.employeeAlias.findMany({ select: { aliasName: true, employeeId: true } }),
  ]);
  const parsed = parseLeadWorkbook(wb, buildEmployeeResolver(users, aliases), new Date().getFullYear());
  if (!parsed.sheets.length) throw new Error("Không nhận ra tab nào của sheet theo dõi khách tiềm năng (Hỏi hàng MXH / Theo dõi / Nhật ký quét / tự tìm)");

  const batch = `lead-${Date.now()}`;
  for (const part of chunk(parsed.items, 100)) {
    await prisma.$transaction(part.map((i) => prisma.leadScanItem.upsert({ where: { sourceKey: i.sourceKey }, create: { sourceKey: i.sourceKey, ...fbData(i, batch) }, update: fbData(i, batch) })));
  }
  for (const part of chunk(parsed.prospects, 100)) {
    await prisma.$transaction(part.map((p) => prisma.leadProspect.upsert({ where: { sourceKey: p.sourceKey }, create: { sourceKey: p.sourceKey, ...prospectData(p, batch) }, update: prospectData(p, batch) })));
  }
  for (const part of chunk(parsed.logs, 100)) {
    await prisma.$transaction(
      part.map((l) => prisma.leadScanLog.upsert({ where: { runDate_slot: { runDate: toDate(l.runDate)!, slot: l.slot } }, create: { runDate: toDate(l.runDate)!, slot: l.slot, ...logData(l) }, update: logData(l) }))
    );
  }

  const unmatched = new Set<string>();
  for (const r of [...parsed.items, ...parsed.prospects]) if (r.assigneeName && !r.assigneeId) unmatched.add(r.assigneeName);
  return {
    sheets: parsed.sheets,
    fb: { total: parsed.items.length, byStatus: countBy(parsed.items) },
    prospects: { total: parsed.prospects.length, byStatus: countBy(parsed.prospects) },
    logs: parsed.logs.length,
    unmatchedNames: [...unmatched].sort(),
  };
}

export interface IncompleteRow {
  kind: "FB" | "SCAN" | "SELF";
  title: string;
  employee: string;
  date: string | null;
  missing: string;
  link: string | null;
}

export async function getLeadReport(from: string, to: string): Promise<{ report: LeadReport; incomplete: IncompleteRow[]; lastImportAt: string | null; names: Record<string, string> }> {
  const [items, prospects, logs, users, last] = await Promise.all([
    prisma.leadScanItem.findMany({ select: { scanDate: true, contactDate: true, assigneeId: true, assigneeName: true, status: true, resultKind: true, missing: true, product: true, groupName: true, link: true } }),
    prisma.leadProspect.findMany({ select: { origin: true, foundDate: true, contactDate: true, assigneeId: true, assigneeName: true, status: true, resultKind: true, missing: true, companyName: true } }),
    prisma.leadScanLog.findMany({ select: { runDate: true, status: true, groups: true, postsRead: true, newPosts: true } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.leadScanItem.aggregate({ _max: { updatedAt: true } }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const report = buildLeadReport({
    fb: items.map((i) => ({ scanDate: toISO(i.scanDate)!, contactDate: toISO(i.contactDate), assigneeId: i.assigneeId, assigneeName: i.assigneeName, status: i.status, resultKind: i.resultKind })),
    prospects: prospects.map((p) => ({ origin: p.origin, foundDate: toISO(p.foundDate), contactDate: toISO(p.contactDate), assigneeId: p.assigneeId, assigneeName: p.assigneeName, status: p.status, resultKind: p.resultKind })),
    logs: logs.map((l) => ({ runDate: toISO(l.runDate)!, status: l.status, groups: l.groups, postsRead: l.postsRead, newPosts: l.newPosts })),
    from,
    to,
    names,
  });
  const who = (id: string | null, name: string | null) => (id && names.get(id)) || name || "Chưa giao";
  const incomplete: IncompleteRow[] = [
    ...items.filter((i) => i.status === "INCOMPLETE").map((i): IncompleteRow => ({ kind: "FB", title: i.product || i.groupName || "Bài quét FB", employee: who(i.assigneeId, i.assigneeName), date: toISO(i.contactDate) ?? toISO(i.scanDate), missing: i.missing ?? "", link: i.link })),
    ...prospects.filter((p) => p.status === "INCOMPLETE").map((p): IncompleteRow => ({ kind: p.origin === "SELF" ? "SELF" : "SCAN", title: p.companyName, employee: who(p.assigneeId, p.assigneeName), date: toISO(p.contactDate) ?? toISO(p.foundDate), missing: p.missing ?? "", link: null })),
  ]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 300);
  return { report, incomplete, lastImportAt: last._max.updatedAt?.toISOString() ?? null, names: Object.fromEntries(names) };
}

export interface LeadWeekRow {
  employeeId: string;
  name: string;
  target: number;
  /** Bài quét giao cho NVKD trong tuần (theo ngày quét). */
  assigned: number;
  /** Liên hệ được ghi nhận (đủ thông tin) trong tuần — số này so với chỉ tiêu. */
  contacted: number;
  /** Trong đó khách có phản hồi / liên hệ được. */
  reached: number;
  /** Dòng có ghi liên hệ nhưng thiếu thông tin nên chưa tính. */
  incomplete: number;
}

/** Lead MXH của 1 tuần trong Kế hoạch tuần (chỉ tiêu riêng, không nằm trong 6 mục/trọng số 100). */
export async function getLeadWeek(weekStartInput: Date, onlyEmployeeId?: string) {
  const { start, end } = weekRange(weekStartInput);
  const last = new Date(end);
  last.setDate(last.getDate() - 1);
  const from = localISO(start);
  const to = localISO(last);

  const [eligible, targets, items] = await Promise.all([
    getEligibleEmployees(),
    prisma.leadMxhTarget.findMany({ where: { weekStart: start } }),
    prisma.leadScanItem.findMany({
      where: { OR: [{ scanDate: { gte: toDate(from)!, lte: toDate(to)! } }, { contactDate: { gte: toDate(from)!, lte: toDate(to)! } }] },
      select: { scanDate: true, contactDate: true, assigneeId: true, assigneeName: true, status: true, resultKind: true },
    }),
  ]);
  const extraIds = [...new Set([...targets.map((t) => t.employeeId), ...items.map((i) => i.assigneeId).filter((x): x is string => !!x)])].filter((id) => !eligible.some((e) => e.id === id));
  const extra = extraIds.length ? await prisma.user.findMany({ where: { id: { in: extraIds } }, select: { id: true, name: true } }) : [];
  const people = [...eligible.map((e) => ({ id: e.id, name: e.name })), ...extra];
  const names = new Map(people.map((p) => [p.id, p.name]));

  const rep = buildLeadReport({
    fb: items.map((i) => ({ scanDate: toISO(i.scanDate)!, contactDate: toISO(i.contactDate), assigneeId: i.assigneeId, assigneeName: i.assigneeName, status: i.status, resultKind: i.resultKind })),
    prospects: [],
    logs: [],
    from,
    to,
    names,
  }).fb;
  const targetOf = new Map(targets.map((t) => [t.employeeId, t.targetValue]));
  const byEmp = new Map(rep.byEmployee.filter((e) => e.employeeId).map((e) => [e.employeeId!, e]));
  const rows: LeadWeekRow[] = people
    .filter((p) => !onlyEmployeeId || p.id === onlyEmployeeId)
    .map((p) => {
      const e = byEmp.get(p.id);
      return { employeeId: p.id, name: p.name, target: targetOf.get(p.id) ?? 0, assigned: e?.assigned ?? 0, contacted: e?.contacted ?? 0, reached: e?.reached ?? 0, incomplete: e?.incomplete ?? 0 };
    })
    .filter((r) => eligible.some((e) => e.id === r.employeeId) || r.target || r.assigned || r.contacted || r.incomplete);
  return { weekStart: start, from, to, rows, scanned: rep.total, unassigned: rep.unassigned };
}

export async function setLeadTargets(weekStartInput: Date, targets: { employeeId: string; targetValue: number }[]) {
  const { start } = weekRange(weekStartInput);
  await prisma.$transaction(
    targets.map((t) =>
      prisma.leadMxhTarget.upsert({
        where: { employeeId_weekStart: { employeeId: t.employeeId, weekStart: start } },
        create: { employeeId: t.employeeId, weekStart: start, targetValue: t.targetValue },
        update: { targetValue: t.targetValue },
      })
    )
  );
}
