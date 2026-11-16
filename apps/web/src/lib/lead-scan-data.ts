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
import { getEligibleEmployees, isWeekEntryLocked, snapToWeekStart, weekRange } from "./week-plan";
import { contactInfoOf } from "./week-plan-entry";
import type { EntryCandidate } from "./lead-scan";

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
  entryMissing: i.entryMissing ?? null,
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
  entryMissing: p.entryMissing ?? null,
  importBatchId: batch,
});

const logData = (l: ParsedLog) => ({ status: l.status, groups: l.groups, postsRead: l.postsRead, newPosts: l.newPosts, note: l.note });

const localDate = (iso: string) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export interface EntrySyncSummary {
  created: number;
  updated: number;
  /** Dòng đã tạo từ sheet nhưng sheet không còn đủ 10 mục nữa -> xoá. */
  removed: number;
  /** Tuần đã khoá nhập liệu: không tạo/sửa (chỉ Quản trị viên nhập bổ sung được). */
  lockedSkipped: number;
}

/**
 * Khách quét báo / tự tìm / Facebook đủ 10 mục trên sheet -> dòng NEW_CONTACT của Kế hoạch tuần (khoá `sheetKey`, sheet là nguồn gốc).
 * Đếm vào chỉ tiêu theo đúng luật có sẵn (classifyEntries: chống trùng khách trong tháng, loại khách cũ). Tuần đã khoá thì không đụng tới.
 */
async function syncEntries(cands: EntryCandidate[]): Promise<EntrySyncSummary> {
  const out: EntrySyncSummary = { created: 0, updated: 0, removed: 0, lockedSkipped: 0 };
  const existing = await prisma.weekPlanResultEntry.findMany({ where: { sheetKey: { not: null } }, select: { id: true, sheetKey: true, weekStart: true, nextActionAt: true } });
  const exByKey = new Map(existing.map((e) => [e.sheetKey!, e]));
  const wanted = new Set(cands.map((c) => c.sheetKey));

  for (const c of cands) {
    const entryDate = localDate(c.entryDate);
    const weekStart = snapToWeekStart(entryDate);
    if (isWeekEntryLocked(weekStart)) {
      out.lockedSkipped++;
      continue;
    }
    const nextActionAt = localDate(c.nextActionAt);
    const data = {
      employeeId: c.employeeId,
      weekStart,
      metric: "NEW_CONTACT" as const,
      entryDate,
      customerName: c.customerName,
      address: c.address,
      content: c.content,
      productInterest: c.productInterest,
      contactInfo: contactInfoOf(c.contactName, c.contactPhone),
      nationality: c.nationality,
      scale: c.scale,
      contactName: c.contactName,
      contactPhone: c.contactPhone,
      need: c.need,
      workDone: c.workDone,
      nextAction: c.nextAction,
      nextActionAt,
    };
    const ex = exByKey.get(c.sheetKey);
    if (ex) {
      // Đổi ngày hẹn nhắc thì cho nhắc lại.
      const dateChanged = ex.nextActionAt?.getTime() !== nextActionAt.getTime();
      await prisma.weekPlanResultEntry.update({ where: { id: ex.id }, data: { ...data, ...(dateChanged ? { followUpNotifiedAt: null } : {}) } });
      out.updated++;
    } else {
      await prisma.weekPlanResultEntry.create({ data: { ...data, sheetKey: c.sheetKey, createdById: c.employeeId } });
      out.created++;
    }
  }
  for (const e of existing) {
    if (wanted.has(e.sheetKey!) || isWeekEntryLocked(e.weekStart)) continue;
    await prisma.weekPlanResultEntry.delete({ where: { id: e.id } });
    out.removed++;
  }
  return out;
}

export interface LeadImportSummary {
  entries: EntrySyncSummary;
  /** Dòng đã ghi nhận liên hệ nhưng chưa đủ 10 mục để tính KH mới liên hệ. */
  entryPending: number;
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
  const all = [...parsed.items, ...parsed.prospects];
  const entries = await syncEntries(all.flatMap((r) => (r.entry ? [r.entry] : [])));
  return {
    entries,
    entryPending: all.filter((r) => r.entryMissing).length,
    sheets: parsed.sheets,
    fb: { total: parsed.items.length, byStatus: countBy(parsed.items) },
    prospects: { total: parsed.prospects.length, byStatus: countBy(parsed.prospects) },
    logs: parsed.logs.length,
    unmatchedNames: [...unmatched].sort(),
  };
}

/** Sheet "Theo dõi khách tiềm năng - PKD1 Hoàng Gia". Đọc qua link xuất xlsx như sheet Báo giá (cần bật chia sẻ "Bất kỳ ai có link đều xem được"). */
const LEAD_SHEET_ID = process.env.LEAD_SHEET_ID || "1h08GeQqVJInBD5niuHffTgb3BkxV6cDMmxKscBiLlUE";

/** Kéo sheet từ Google và nhập (cập nhật theo khoá nguồn). Ném Error có thông báo tiếng Việt nếu không tải được. */
export async function syncLeadSheet(): Promise<LeadImportSummary> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${LEAD_SHEET_ID}/export?format=xlsx`, { signal: AbortSignal.timeout(120_000), redirect: "follow" });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || type.includes("text/html")) {
    throw new Error(`Không đọc được Google Sheet (HTTP ${res.status}) — sheet cần bật chia sẻ "Bất kỳ ai có link đều xem được" (quyền Người xem).`);
  }
  return importLeadWorkbook(Buffer.from(await res.arrayBuffer()));
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
    prisma.leadScanItem.findMany({ select: { scanDate: true, contactDate: true, assigneeId: true, assigneeName: true, status: true, resultKind: true, missing: true, entryMissing: true, product: true, groupName: true, link: true } }),
    prisma.leadProspect.findMany({ select: { origin: true, foundDate: true, contactDate: true, assigneeId: true, assigneeName: true, status: true, resultKind: true, missing: true, entryMissing: true, companyName: true } }),
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
  // Hai loại: chưa đủ mức liên hệ (INCOMPLETE) và đã ghi nhận liên hệ nhưng chưa đủ 10 mục để tính "KH mới liên hệ" (entryMissing).
  const entryMiss = (m: string | null) => `KH mới liên hệ — thiếu: ${m}`;
  const incomplete: IncompleteRow[] = [
    ...items.filter((i) => i.status === "INCOMPLETE" || (i.status === "CONTACTED" && i.entryMissing)).map((i): IncompleteRow => ({ kind: "FB", title: i.product || i.groupName || "Bài quét FB", employee: who(i.assigneeId, i.assigneeName), date: toISO(i.contactDate) ?? toISO(i.scanDate), missing: i.status === "INCOMPLETE" ? i.missing ?? "" : entryMiss(i.entryMissing), link: i.link })),
    ...prospects.filter((p) => p.status === "INCOMPLETE" || (p.status === "CONTACTED" && p.entryMissing)).map((p): IncompleteRow => ({ kind: p.origin === "SELF" ? "SELF" : "SCAN", title: p.companyName, employee: who(p.assigneeId, p.assigneeName), date: toISO(p.contactDate) ?? toISO(p.foundDate), missing: p.status === "INCOMPLETE" ? p.missing ?? "" : entryMiss(p.entryMissing), link: null })),
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
