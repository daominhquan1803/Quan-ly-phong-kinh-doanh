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
import { careCreatedAt, careNote, companyKey, leadCustomerCode, mapChannel, mapOutcome, ownershipOf, vnMidnight } from "./lead-care";
import { assignCustomerToUnassignedInvoices } from "./customer-invoice-sync";

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

export interface CustomerSyncSummary {
  /** Hồ sơ khách mới tạo (mã tạm KHM-…). */
  created: number;
  /** Trùng tên khách đã có (cùng NVKD hoặc chưa ai phụ trách) -> dùng hồ sơ cũ. */
  linked: number;
  logsCreated: number;
  logsUpdated: number;
  /** Trùng khách của NVKD khác (hoặc trùng nhiều hồ sơ) -> KHÔNG ghi đè, anh xử lý. Dạng "Tên khách (NVKD) — lý do". */
  conflicts: string[];
}

type CustomerRow = { id: string; customerCode: string; customerName: string; salesEmployeeId: string | null; leadKey: string | null; address: string | null; contactPerson: string | null; contactPhone: string | null; staffSize: string | null; ownership: string | null; painPoint: string | null };

/**
 * Khách đủ 10 mục trên sheet -> hồ sơ khách + lịch sử chăm sóc (khoá `sheetKey` = dòng sheet + ngày liên hệ) + hẹn chăm sóc lại.
 * - Ghép khách: theo khoá dòng sheet đã tạo trước đó, rồi theo tên công ty (BẰNG nhau sau khi bỏ dấu/loại hình). Không có -> tạo mới mã KHM-xxxxxx.
 * - Khách có NVKD khác phụ trách (hoặc trùng nhiều hồ sơ): không đụng, báo vào `conflicts`. Hồ sơ đã có chỉ được điền chỗ trống.
 * - Mỗi (dòng sheet, ngày liên hệ) = 1 lần chăm sóc; sheet đổi nội dung cùng ngày thì sửa tại chỗ, đổi ngày liên hệ thì thêm lần mới (lịch sử tích luỹ).
 * - Hẹn chăm sóc lại (followUpAt) chỉ gắn vào lần mới nhất của khách; dòng Kế hoạch tuần tương ứng được đánh dấu "đã nhắc" để NVKD không nhận 2 thông báo.
 * Chạy cho mọi dòng đủ 10 mục kể cả tuần Kế hoạch tuần đã khoá (hồ sơ/lịch sử không bị khoá theo tuần).
 */
async function syncCustomers(cands: EntryCandidate[], now: Date = new Date()): Promise<CustomerSyncSummary> {
  const out: CustomerSyncSummary = { created: 0, linked: 0, logsCreated: 0, logsUpdated: 0, conflicts: [] };
  if (!cands.length) return out;

  const [customers, users, logs] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, customerCode: true, customerName: true, salesEmployeeId: true, leadKey: true, address: true, contactPerson: true, contactPhone: true, staffSize: true, ownership: true, painPoint: true, mergedIntoId: true } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.customerCareLog.findMany({ where: { sheetKey: { not: null } }, select: { id: true, sheetKey: true } }),
  ]);
  const empName = new Map(users.map((u) => [u.id, u.name]));
  const taken = new Set(customers.map((c) => c.customerCode));
  const byLeadKey = new Map<string, CustomerRow>();
  const byName = new Map<string, CustomerRow[]>();
  // Hồ sơ đã gộp quy về hồ sơ chính (cả khoá dòng sheet lẫn tên) để lần chăm sóc không rơi vào hồ sơ ẩn.
  const byId = new Map<string, CustomerRow>(customers.map((c) => [c.id, c]));
  const add = (c: CustomerRow & { mergedIntoId?: string | null }) => {
    const target = (c.mergedIntoId && byId.get(c.mergedIntoId)) || c;
    if (c.leadKey) byLeadKey.set(c.leadKey, target);
    const k = companyKey(c.customerName);
    const list = byName.get(k) ?? [];
    if (k && !list.includes(target)) byName.set(k, [...list, target]);
  };
  customers.forEach(add);
  const logByKey = new Map(logs.map((l) => [l.sheetKey!, l.id]));

  // Lần mới nhất của từng khách (theo ngày liên hệ) mới được gắn hẹn chăm sóc lại.
  const resolved: { cand: EntryCandidate; customerId: string }[] = [];
  const conflictSeen = new Set<string>();
  const conflict = (c: EntryCandidate, why: string) => {
    const line = `${c.customerName} (${empName.get(c.employeeId) ?? "?"}) — ${why}`;
    if (!conflictSeen.has(line)) {
      conflictSeen.add(line);
      out.conflicts.push(line);
    }
  };

  for (const c of [...cands].sort((a, b) => a.entryDate.localeCompare(b.entryDate))) {
    let cust = byLeadKey.get(c.sheetKey);
    if (!cust) {
      const key = companyKey(c.customerName);
      const matches = key ? byName.get(key) ?? [] : [];
      if (matches.length > 1) {
        conflict(c, "trùng nhiều hồ sơ khách cùng tên");
        continue;
      }
      if (matches.length === 1) {
        cust = matches[0];
        if (cust.salesEmployeeId && cust.salesEmployeeId !== c.employeeId) {
          conflict(c, `đã là khách của ${empName.get(cust.salesEmployeeId) ?? "NVKD khác"} (${cust.customerCode})`);
          continue;
        }
        out.linked++;
      } else {
        const code = leadCustomerCode(c.sheetKey, taken);
        taken.add(code);
        const made = await prisma.customer.create({
          data: { customerCode: code, customerName: c.customerName, salesEmployeeId: c.employeeId, source: "SHEET_LEAD", leadKey: c.sheetKey, address: c.address, contactPerson: c.contactName, contactPhone: c.contactPhone, staffSize: c.scale, ownership: ownershipOf(c.nationality), painPoint: c.need },
          select: { id: true, customerCode: true, customerName: true, salesEmployeeId: true, leadKey: true, address: true, contactPerson: true, contactPhone: true, staffSize: true, ownership: true, painPoint: true },
        });
        add(made);
        cust = made;
        out.created++;
      }
    }
    // Hồ sơ đã có (AMIS / NVKD nhập tay): chỉ điền chỗ trống, không ghi đè.
    const fill: Record<string, string> = {};
    if (!cust.address) fill.address = c.address;
    if (!cust.contactPerson) fill.contactPerson = c.contactName;
    if (!cust.contactPhone) fill.contactPhone = c.contactPhone;
    if (!cust.staffSize) fill.staffSize = c.scale;
    if (!cust.ownership) fill.ownership = ownershipOf(c.nationality);
    if (!cust.painPoint) fill.painPoint = c.need;
    const data: Record<string, string> = { ...fill };
    const takeOwner = !cust.salesEmployeeId;
    if (takeOwner) data.salesEmployeeId = c.employeeId;
    if (Object.keys(data).length) {
      await prisma.customer.update({ where: { id: cust.id }, data });
      Object.assign(cust, data);
      if (takeOwner) await assignCustomerToUnassignedInvoices(cust.customerCode, c.employeeId);
    }
    resolved.push({ cand: c, customerId: cust.id });
  }

  const latest = new Map<string, EntryCandidate>(); // customerId -> lần liên hệ mới nhất (đã sắp theo ngày tăng dần)
  for (const r of resolved) latest.set(r.customerId, r.cand);
  const reminded: string[] = [];
  for (const { cand: c, customerId } of resolved) {
    const sheetKey = `${c.sheetKey}|${c.entryDate}`;
    const isLatest = latest.get(customerId) === c;
    const followUpAt = isLatest ? vnMidnight(c.nextActionAt) : null;
    const base = {
      customerId,
      employeeId: c.employeeId,
      channel: mapChannel(c.channel),
      outcome: mapOutcome(c.result, c.resultKind),
      note: careNote(c),
      needGroup: mapOutcome(c.result, c.resultKind) === "NEW_NEED" ? c.need.slice(0, 100) : null,
      followUpAt,
    };
    const existingId = logByKey.get(sheetKey);
    if (existingId) {
      await prisma.customerCareLog.update({ where: { id: existingId }, data: base });
      out.logsUpdated++;
    } else {
      await prisma.customerCareLog.create({ data: { ...base, sheetKey, createdAt: careCreatedAt(c.entryDate, now) } });
      out.logsCreated++;
    }
    if (isLatest) {
      reminded.push(c.sheetKey);
      // Lần cũ (cũng từ sheet) của khách này không còn hẹn: hẹn chỉ nằm ở lần mới nhất.
      await prisma.customerCareLog.updateMany({ where: { customerId, sheetKey: { not: null, notIn: [sheetKey] }, followUpAt: { not: null } }, data: { followUpAt: null } });
    }
  }
  // Hẹn đã vào hồ sơ chăm sóc (có nhắc riêng) -> bỏ nhắc trùng của Kế hoạch tuần.
  if (reminded.length) await prisma.weekPlanResultEntry.updateMany({ where: { sheetKey: { in: reminded }, followUpNotifiedAt: null }, data: { followUpNotifiedAt: now } });
  return out;
}

export interface LeadImportSummary {
  entries: EntrySyncSummary;
  /** Hồ sơ khách + lịch sử chăm sóc tạo từ các dòng đủ 10 mục. */
  customers: CustomerSyncSummary;
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
  const cands = all.flatMap((r) => (r.entry ? [r.entry] : []));
  const entries = await syncEntries(cands);
  const customers = await syncCustomers(cands);
  return {
    entries,
    customers,
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
