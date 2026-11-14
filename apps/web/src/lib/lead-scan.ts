/**
 * Lead quét MXH / khách tiềm năng — đọc file Excel tải từ Google Sheet "Theo dõi khách tiềm năng - PKD1 Hoàng Gia" (anh Quân chốt 14/11/2026).
 *
 * Nhận diện tab theo tiêu đề cột (không phụ thuộc tên tab):
 *  - FB     : có "Ngày quét" + "Link bài"                    -> tab "Hỏi hàng MXH" (bài hỏi hàng quét trên Facebook)
 *  - SCAN   : có "Ngày tìm" + "Tên công ty" + "Hạng"         -> tab "Theo dõi" (khách doanh nghiệp lớn do AI quét báo)
 *  - SELF   : có "Ngày tìm" + "Tên công ty", không có "Hạng" -> tab "Mr … tự tìm" / "PT.…" (khách NVKD tự tìm; chủ tab lấy từ tên tab)
 *  - LOG    : có "Lượt" + "Trạng thái" + "Số bài đọc"       -> tab "Nhật ký quét"
 *
 * Luật ghi nhận: kết quả liên hệ phải ĐẦY ĐỦ thì dòng mới được tính là "đã liên hệ" (status CONTACTED); dòng có ghi liên hệ nhưng
 * thiếu thông tin là INCOMPLETE — không tính, hiện trong danh sách "chưa đủ thông tin" để NVKD bổ sung trên sheet.
 *  - FB     : đủ = Ngày liên hệ + NVKD nhận (khớp nhân viên trong app) + Kết quả hoặc Ghi chú.
 *  - SCAN   : đủ = Ngày NVKD liên hệ + NVKD phụ trách + Kênh liên hệ + Kết quả liên hệ.
 *  - SELF   : đủ = Người liên hệ hoặc Điện thoại + Ghi chú (kết quả gọi); ngày liên hệ lấy theo "Ngày tìm".
 * "Liên hệ được" (REACHED) = khách có phản hồi/trao đổi — phân loại tự động theo từ khoá trong Kết quả + Ghi chú (classifyResult);
 * đã nhắn/để lại thông tin chờ khách là WAITING, chưa tính là liên hệ được.
 */
import * as XLSX from "xlsx";
import { normalizeVN } from "./text-normalize";
import { findMonthWeekForDate } from "./week-plan";

export type LeadStatus = "NEW" | "ASSIGNED" | "INCOMPLETE" | "CONTACTED";
export type ResultKind = "REACHED" | "WAITING" | "NO_RESPONSE" | "OTHER";

// ---------------------------------------------------------------- ô / ngày / phân loại

const INVISIBLE = /[​-‍﻿]/g;
export const cleanCell = (v: unknown): string => (v == null ? "" : String(v)).replace(INVISIBLE, "").replace(/\s+/g, " ").trim();

const pad = (n: number) => String(n).padStart(2, "0");
const validYMD = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** Ngày trong sheet -> "YYYY-MM-DD". Nhận dd/mm/yyyy, d/m/yyyy, yyyy-mm-dd, số serial Excel, "dd/mm" (thiếu năm -> defaultYear). */
export function parseSheetDate(v: unknown, defaultYear: number): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    if (v < 30000 || v > 80000) return null;
    const p = XLSX.SSF.parse_date_code(v);
    return p && validYMD(p.y, p.m, p.d) ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : null;
  }
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = cleanCell(v);
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return validYMD(+m[3], +m[2], +m[1]) ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : null;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validYMD(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : null;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (m) return validYMD(defaultYear, +m[2], +m[1]) ? `${defaultYear}-${pad(+m[2])}-${pad(+m[1])}` : null;
  return null;
}

// Thứ tự ưu tiên: không phản hồi > liên hệ được > đã nhắn/chờ. Chữ không dấu (đã normalizeVN).
const NO_RESPONSE =
  /khong phan hoi|chua phan hoi|chua nghe|khong nghe|\bk nghe|\bknm\b|khong lien lac|chua lien lac|chua lien he duoc|chua ket noi|thue bao|sai so|(sdt|so) (k|khong) dung|\bk dung\b|khong phai (cua|so)|\bk phai so|khong truy cap|khong vao duoc|nhom kin|\bk click|link\w* k xem|khong xem duoc|khoa nhan cuoc goi|tam khoa/;
const REACHED =
  /bao gia|gui mau|dam phan|quan tam|co don|da mua|da tim duoc|da co ncc|tu choi|dang khai thac|dang lien he voi|trao doi|khach phan hoi|da phan hoi|hen goi lai|dang lay thong tin|co nhu cau/;
const WAITING_REPLY = /doi (khach )?phan hoi|cho (khach )?phan hoi|doi (khach )?tra loi/;
const WAITING = /de lai|comment|nt mess|nt zalo|nt tin|nhan tin|kb zalo|ket ban|zalo|inbox|ttlh|messenger|\bib\b|goi lai/;

/** Phân loại kết quả liên hệ (chữ tự do) -> REACHED / WAITING / NO_RESPONSE / OTHER; rỗng -> null. */
export function classifyResult(text: string | null | undefined): ResultKind | null {
  const t = normalizeVN(cleanCell(text));
  if (!t) return null;
  if (NO_RESPONSE.test(t)) return "NO_RESPONSE";
  if (WAITING_REPLY.test(t)) return "WAITING";
  if (REACHED.test(t)) return "REACHED";
  if (WAITING.test(t)) return "WAITING";
  return "OTHER";
}

/** "Chưa liên hệ" trong cột kết quả nghĩa là chưa làm gì — không coi là có ghi liên hệ. */
const isNotYet = (s: string) => normalizeVN(s) === "chua lien he";

// ---------------------------------------------------------------- nhân viên

export type EmployeeResolver = (name: string) => string | null;

/** Khớp tên NVKD trong sheet ("Dung", "Tùng") với nhân viên: bí danh > tên đầy đủ > tên gọi (từ cuối) nếu chỉ trùng 1 người. */
export function buildEmployeeResolver(users: { id: string; name: string }[], aliases: { aliasName: string; employeeId: string }[] = []): EmployeeResolver {
  const alias = new Map(aliases.map((a) => [normalizeVN(a.aliasName), a.employeeId]));
  const full = new Map(users.map((u) => [normalizeVN(u.name), u.id]));
  const last = new Map<string, string[]>();
  for (const u of users) {
    const w = normalizeVN(u.name).split(" ").pop() ?? "";
    last.set(w, [...(last.get(w) ?? []), u.id]);
  }
  return (name) => {
    const raw = normalizeVN(cleanCell(name));
    const n = raw.replace(/^(mr|ms|mrs|pt|anh|chi)[.\s]+/, "");
    if (!n) return null;
    const a = alias.get(raw) ?? alias.get(n) ?? full.get(n);
    if (a) return a;
    const l = last.get(n);
    return l && l.length === 1 ? l[0] : null;
  };
}

/** Chủ của tab "tự tìm" từ tên tab: "Mr Tùng tự tìm" -> "tung", "PT.DUNG" -> "dung". */
export function ownerFromSheetName(sheetName: string): string {
  return normalizeVN(sheetName).replace(/tu tim/g, "").trim().replace(/^(mr|ms|mrs|pt)[.\s]+/, "").trim();
}

// ---------------------------------------------------------------- tiêu đề cột

type Rows = unknown[][];
const normHeaders = (row: unknown[]) => row.map((c) => normalizeVN(cleanCell(c)));

function findHeaderRow(rows: Rows, test: (h: string[]) => boolean, maxScan = 10): number {
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) if (test(normHeaders(rows[i] ?? []))) return i;
  return -1;
}

function colMap<K extends string>(header: unknown[], spec: Record<K, RegExp>): Record<K, number> {
  const h = normHeaders(header);
  const out = {} as Record<K, number>;
  for (const k of Object.keys(spec) as K[]) out[k] = h.findIndex((x) => spec[k].test(x));
  return out;
}

const has = (h: string[], re: RegExp) => h.some((x) => re.test(x));
const isFb = (h: string[]) => has(h, /^ngay quet/) && has(h, /^link/);
const isLog = (h: string[]) => has(h, /^luot/) && has(h, /^trang thai/) && has(h, /^so bai doc/);
const isScan = (h: string[]) => has(h, /^ngay tim/) && has(h, /^ten cong ty/) && has(h, /^hang$/);
const isSelf = (h: string[]) => has(h, /^ngay tim/) && has(h, /^ten cong ty/) && !has(h, /^hang$/);

// ---------------------------------------------------------------- kết quả parse

interface Common {
  assigneeName: string | null;
  assigneeId: string | null;
  status: LeadStatus;
  resultKind: ResultKind | null;
  /** Các mục còn thiếu (chỉ khi INCOMPLETE). */
  missing: string | null;
}
export interface ParsedFbItem extends Common {
  sourceKey: string;
  scanDate: string;
  postDate: string | null;
  platform: string | null;
  groupName: string | null;
  poster: string | null;
  product: string | null;
  quantity: string | null;
  area: string | null;
  contactInPost: string | null;
  link: string | null;
  contactDate: string | null;
  result: string | null;
  note: string | null;
}
export interface ParsedProspect extends Common {
  sourceKey: string;
  origin: "SCAN" | "SELF";
  foundDate: string | null;
  rank: string | null;
  score: number | null;
  companyName: string;
  taxCode: string | null;
  industry: string | null;
  area: string | null;
  signal: string | null;
  products: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  sourceNote: string | null;
  contactDate: string | null;
  channel: string | null;
  result: string | null;
  note: string | null;
  nextStep: string | null;
  nextDate: string | null;
}
export interface ParsedLog {
  runDate: string;
  slot: string;
  status: string;
  groups: number;
  postsRead: number;
  newPosts: number;
  note: string | null;
}

const val = (row: unknown[], idx: number): string | null => (idx >= 0 ? cleanCell(row[idx]) || null : null);
const num = (row: unknown[], idx: number): number => {
  const n = Number(cleanCell(idx >= 0 ? row[idx] : "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Ghép trạng thái + các mục thiếu cho 1 dòng đã biết đủ/thiếu từng phần. */
function judge(a: { assigneeName: string | null; assigneeId: string | null; signal: boolean; missing: string[]; resultText: string }): Common {
  const missing = a.missing;
  const status: LeadStatus = a.signal ? (missing.length ? "INCOMPLETE" : "CONTACTED") : a.assigneeName ? "ASSIGNED" : "NEW";
  return {
    assigneeName: a.assigneeName,
    assigneeId: a.assigneeId,
    status,
    resultKind: status === "CONTACTED" ? classifyResult(a.resultText) : null,
    missing: status === "INCOMPLETE" ? missing.join(", ") : null,
  };
}

export function parseFacebookRows(rows: Rows, resolve: EmployeeResolver, defaultYear: number): ParsedFbItem[] {
  const hi = findHeaderRow(rows, isFb);
  if (hi < 0) return [];
  const c = colMap(rows[hi], {
    stt: /^stt$/, scanDate: /^ngay quet/, postDate: /^ngay dang/, platform: /^nen tang/, groupName: /^nhom/, poster: /^nguoi dang/,
    product: /^san pham can/, quantity: /^so luong/, area: /^khu vuc/, contactInPost: /^lien he trong bai/, link: /^link/,
    contactDate: /^ngay lien he/, assignee: /^nvkd nhan/, result: /^ket qua/, note: /^ghi chu/,
  });
  const out: ParsedFbItem[] = [];
  for (const row of rows.slice(hi + 1)) {
    const scanDate = parseSheetDate(c.scanDate >= 0 ? row[c.scanDate] : null, defaultYear);
    if (!scanDate) continue;
    const link = val(row, c.link);
    const stt = val(row, c.stt);
    const contactDate = parseSheetDate(c.contactDate >= 0 ? row[c.contactDate] : null, defaultYear);
    const assigneeName = val(row, c.assignee);
    const assigneeId = assigneeName ? resolve(assigneeName) : null;
    const resultRaw = val(row, c.result);
    const result = resultRaw && !isNotYet(resultRaw) ? resultRaw : null;
    const note = val(row, c.note);
    const missing: string[] = [];
    if (!contactDate) missing.push("ngày liên hệ");
    if (!assigneeName) missing.push("NVKD nhận");
    else if (!assigneeId) missing.push("NVKD nhận (tên không khớp nhân viên)");
    if (!result && !note) missing.push("kết quả");
    out.push({
      sourceKey: link ?? `fb|${scanDate}|${stt ?? out.length}`,
      scanDate,
      postDate: parseSheetDate(c.postDate >= 0 ? row[c.postDate] : null, defaultYear),
      platform: val(row, c.platform),
      groupName: val(row, c.groupName),
      poster: val(row, c.poster),
      product: val(row, c.product),
      quantity: val(row, c.quantity),
      area: val(row, c.area),
      contactInPost: val(row, c.contactInPost),
      link,
      contactDate,
      result,
      note,
      ...judge({ assigneeName, assigneeId, signal: !!(contactDate || result), missing, resultText: `${result ?? ""} ${note ?? ""}` }),
    });
  }
  return out;
}

export function parseScanProspectRows(rows: Rows, resolve: EmployeeResolver, defaultYear: number): ParsedProspect[] {
  const hi = findHeaderRow(rows, isScan);
  if (hi < 0) return [];
  const c = colMap(rows[hi], {
    foundDate: /^ngay tim/, rank: /^hang$/, score: /^diem/, company: /^ten cong ty/, taxCode: /^mst/, industry: /^nganh/, area: /^khu vuc/,
    signal: /^tin hieu/, products: /^san pham nen chao/, contactPerson: /^nguoi lien he/, phone: /^dien thoai/, email: /^email/, sourceNote: /^nguon/,
    assignee: /^nvkd phu trach/, contactDate: /^ngay nvkd lien he/, channel: /^kenh lien he/, result: /^ket qua lien he/, note: /^ghi chu/,
    nextStep: /^buoc tiep theo/, nextDate: /^ngay hen tiep/,
  });
  const out: ParsedProspect[] = [];
  for (const row of rows.slice(hi + 1)) {
    const companyName = val(row, c.company);
    if (!companyName) continue;
    const taxCode = val(row, c.taxCode);
    const contactDate = parseSheetDate(c.contactDate >= 0 ? row[c.contactDate] : null, defaultYear);
    const channel = val(row, c.channel);
    const resultRaw = val(row, c.result);
    const result = resultRaw && !isNotYet(resultRaw) ? resultRaw : null;
    const assigneeName = val(row, c.assignee);
    const assigneeId = assigneeName ? resolve(assigneeName) : null;
    const note = val(row, c.note);
    const missing: string[] = [];
    if (!contactDate) missing.push("ngày liên hệ");
    if (!assigneeName) missing.push("NVKD phụ trách");
    else if (!assigneeId) missing.push("NVKD phụ trách (tên không khớp nhân viên)");
    if (!channel) missing.push("kênh liên hệ");
    if (!result) missing.push("kết quả liên hệ");
    const score = num(row, c.score);
    out.push({
      sourceKey: `SCAN|${taxCode ?? normalizeVN(companyName)}`,
      origin: "SCAN",
      foundDate: parseSheetDate(c.foundDate >= 0 ? row[c.foundDate] : null, defaultYear),
      rank: val(row, c.rank),
      score: score || null,
      companyName,
      taxCode,
      industry: val(row, c.industry),
      area: val(row, c.area),
      signal: val(row, c.signal),
      products: val(row, c.products),
      contactPerson: val(row, c.contactPerson),
      phone: val(row, c.phone),
      email: val(row, c.email),
      sourceNote: val(row, c.sourceNote),
      contactDate,
      channel,
      result,
      note,
      nextStep: val(row, c.nextStep),
      nextDate: parseSheetDate(c.nextDate >= 0 ? row[c.nextDate] : null, defaultYear),
      ...judge({ assigneeName, assigneeId, signal: !!(contactDate || channel || result), missing, resultText: `${result ?? ""} ${note ?? ""}` }),
    });
  }
  return out;
}

export function parseSelfRows(rows: Rows, sheetName: string, resolve: EmployeeResolver, defaultYear: number): ParsedProspect[] {
  const hi = findHeaderRow(rows, isSelf);
  if (hi < 0) return [];
  const owner = ownerFromSheetName(sheetName);
  const ownerId = owner ? resolve(owner) : null;
  const c = colMap(rows[hi], {
    foundDate: /^ngay tim/, company: /^ten cong ty/, taxCode: /^mst/, industry: /^nganh/, area: /^khu vuc/,
    contactPerson: /^nguoi lien he/, phone: /^dien thoai/, note: /^ghi chu/,
  });
  const out: ParsedProspect[] = [];
  for (const row of rows.slice(hi + 1)) {
    const companyName = val(row, c.company);
    if (!companyName) continue;
    const taxCode = val(row, c.taxCode);
    const contactPerson = val(row, c.contactPerson);
    const phone = val(row, c.phone);
    const note = val(row, c.note);
    const foundDate = parseSheetDate(c.foundDate >= 0 ? row[c.foundDate] : null, defaultYear);
    const missing: string[] = [];
    if (!ownerId) missing.push("NVKD (tên tab không khớp nhân viên)");
    if (!contactPerson && !phone) missing.push("người liên hệ / điện thoại");
    if (!foundDate) missing.push("ngày");
    out.push({
      sourceKey: `SELF|${owner}|${taxCode ?? normalizeVN(companyName)}`,
      origin: "SELF",
      foundDate,
      rank: null,
      score: null,
      companyName,
      taxCode,
      industry: val(row, c.industry),
      area: val(row, c.area),
      signal: null,
      products: null,
      contactPerson,
      phone,
      email: null,
      sourceNote: null,
      contactDate: foundDate,
      channel: null,
      result: null,
      note,
      nextStep: null,
      nextDate: null,
      ...judge({ assigneeName: owner || null, assigneeId: ownerId, signal: !!note, missing, resultText: note ?? "" }),
    });
  }
  return out;
}

export function parseLogRows(rows: Rows, defaultYear: number): ParsedLog[] {
  const hi = findHeaderRow(rows, isLog);
  if (hi < 0) return [];
  const c = colMap(rows[hi], { runDate: /^ngay$/, slot: /^luot/, status: /^trang thai/, groups: /^so nhom/, postsRead: /^so bai doc/, newPosts: /^bai moi/, note: /^nguyen nhan|^ghi chu/ });
  const out: ParsedLog[] = [];
  const seen = new Map<string, number>();
  for (const row of rows.slice(hi + 1)) {
    const runDate = parseSheetDate(c.runDate >= 0 ? row[c.runDate] : null, defaultYear);
    const slot = val(row, c.slot);
    if (!runDate || !slot) continue;
    const k = `${runDate}|${slot}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    out.push({
      runDate,
      slot: n > 1 ? `${slot}#${n}` : slot,
      status: val(row, c.status) ?? "",
      groups: num(row, c.groups),
      postsRead: num(row, c.postsRead),
      newPosts: num(row, c.newPosts),
      note: val(row, c.note),
    });
  }
  return out;
}

export const isLogOk = (status: string) => normalizeVN(status) === "thanh cong";

export interface ParsedWorkbook {
  items: ParsedFbItem[];
  prospects: ParsedProspect[];
  logs: ParsedLog[];
  /** Tab nhận diện được: tên tab -> loại. */
  sheets: { name: string; kind: "FB" | "SCAN" | "SELF" | "LOG"; rows: number }[];
}

export function parseLeadWorkbook(wb: XLSX.WorkBook, resolve: EmployeeResolver, defaultYear: number): ParsedWorkbook {
  const res: ParsedWorkbook = { items: [], prospects: [], logs: [], sheets: [] };
  for (const name of wb.SheetNames) {
    const rows: Rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" });
    const heads = rows.slice(0, 10).map((r) => normHeaders(r ?? []));
    const kind = heads.some(isFb) ? "FB" : heads.some(isLog) ? "LOG" : heads.some(isScan) ? "SCAN" : heads.some(isSelf) ? "SELF" : null;
    if (!kind) continue;
    if (kind === "FB") {
      const r = parseFacebookRows(rows, resolve, defaultYear);
      res.items.push(...r);
      res.sheets.push({ name, kind, rows: r.length });
    } else if (kind === "LOG") {
      const r = parseLogRows(rows, defaultYear);
      res.logs.push(...r);
      res.sheets.push({ name, kind, rows: r.length });
    } else if (kind === "SCAN") {
      const r = parseScanProspectRows(rows, resolve, defaultYear);
      res.prospects.push(...r);
      res.sheets.push({ name, kind, rows: r.length });
    } else {
      const r = parseSelfRows(rows, name, resolve, defaultYear);
      res.prospects.push(...r);
      res.sheets.push({ name, kind, rows: r.length });
    }
  }
  // Cùng khoá trong 1 file (vd 2 dòng cùng link): dòng sau thay dòng trước, giữ đúng số dòng thật sau khi nhập.
  res.items = [...new Map(res.items.map((i) => [i.sourceKey, i])).values()];
  res.prospects = [...new Map(res.prospects.map((p) => [p.sourceKey, p])).values()];
  return res;
}

// ---------------------------------------------------------------- báo cáo

export interface FbRow {
  scanDate: string;
  contactDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  status: string;
  resultKind: string | null;
}
export interface ProspectRow {
  origin: string;
  foundDate: string | null;
  contactDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  status: string;
  resultKind: string | null;
}
export interface LogRow {
  runDate: string;
  status: string;
  groups: number;
  postsRead: number;
  newPosts: number;
}

export interface Counts {
  /** Bài quét (FB) / khách tìm được (tiềm năng). */
  total: number;
  /** Đã giao NVKD (nhận). */
  assigned: number;
  /** Đã liên hệ — đủ thông tin, được ghi nhận. */
  contacted: number;
  /** Liên hệ được (khách phản hồi). */
  reached: number;
}
export interface PeriodRow extends Counts {
  key: string;
  label: string;
}
export interface EmployeeRow {
  employeeId: string | null;
  name: string;
  assigned: number;
  contacted: number;
  reached: number;
  incomplete: number;
}
export type Granularity = "day" | "week" | "month";
export interface LeadGroupReport {
  total: number;
  assigned: number;
  unassigned: number;
  contacted: number;
  reached: number;
  incomplete: number;
  byEmployee: EmployeeRow[];
  series: Record<Granularity, PeriodRow[]>;
}
export interface LeadReport {
  from: string;
  to: string;
  fb: LeadGroupReport;
  scan: LeadGroupReport;
  self: LeadGroupReport;
  scanRuns: { runs: number; ok: number; failed: number; groups: number; postsRead: number; newPosts: number; byDay: { key: string; label: string; runs: number; ok: number; postsRead: number; newPosts: number }[] };
}

const inRange = (d: string | null, from: string, to: string) => !!d && d >= from && d <= to;
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Khoá + nhãn của 1 ngày theo từng kiểu gộp; "tuần" theo cách chia tuần của Kế hoạch tuần (4 tuần/tháng). */
export function periodOf(iso: string, g: Granularity): { key: string; label: string } {
  if (g === "day") return { key: iso, label: `${dmy(iso)}/${iso.slice(0, 4)}` };
  if (g === "month") return { key: iso.slice(0, 7), label: `Tháng ${+iso.slice(5, 7)}/${iso.slice(0, 4)}` };
  const w = findMonthWeekForDate(new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  const s = w.start;
  return { key: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`, label: `Tuần ${w.weekIndex} tháng ${w.month}/${w.year}` };
}

type Row = { date: string | null; contactDate: string | null; assigneeId: string | null; assigneeName: string | null; status: string; resultKind: string | null };

function buildGroup(rows: Row[], from: string, to: string, names: Map<string, string>): LeadGroupReport {
  const g: LeadGroupReport = { total: 0, assigned: 0, unassigned: 0, contacted: 0, reached: 0, incomplete: 0, byEmployee: [], series: { day: [], week: [], month: [] } };
  const emp = new Map<string, EmployeeRow>();
  const ser: Record<Granularity, Map<string, PeriodRow>> = { day: new Map(), week: new Map(), month: new Map() };
  const bump = (iso: string, f: keyof Counts) => {
    for (const gran of ["day", "week", "month"] as Granularity[]) {
      const p = periodOf(iso, gran);
      const cur = ser[gran].get(p.key) ?? { ...p, total: 0, assigned: 0, contacted: 0, reached: 0 };
      cur[f]++;
      ser[gran].set(p.key, cur);
    }
  };
  const who = (r: Row) => {
    const key = r.assigneeId ?? (r.assigneeName ? `name:${r.assigneeName}` : "none");
    let e = emp.get(key);
    if (!e) {
      e = { employeeId: r.assigneeId, name: (r.assigneeId && names.get(r.assigneeId)) || r.assigneeName || "Chưa giao", assigned: 0, contacted: 0, reached: 0, incomplete: 0 };
      emp.set(key, e);
    }
    return e;
  };
  for (const r of rows) {
    if (inRange(r.date, from, to)) {
      g.total++;
      bump(r.date!, "total");
      if (r.assigneeId || r.assigneeName) {
        g.assigned++;
        bump(r.date!, "assigned");
        who(r).assigned++;
      }
      if (r.status === "INCOMPLETE") {
        g.incomplete++;
        who(r).incomplete++;
      }
    }
    if (r.status === "CONTACTED" && inRange(r.contactDate, from, to)) {
      g.contacted++;
      bump(r.contactDate!, "contacted");
      who(r).contacted++;
      if (r.resultKind === "REACHED") {
        g.reached++;
        bump(r.contactDate!, "reached");
        who(r).reached++;
      }
    }
  }
  g.unassigned = g.total - g.assigned;
  g.byEmployee = [...emp.values()].sort((a, b) => b.assigned + b.contacted - (a.assigned + a.contacted));
  for (const gran of ["day", "week", "month"] as Granularity[]) g.series[gran] = [...ser[gran].values()].sort((a, b) => a.key.localeCompare(b.key));
  return g;
}

/** Báo cáo trong khoảng [from, to] (YYYY-MM-DD, gồm 2 đầu): bài quét/khách tìm theo ngày quét/tìm; liên hệ theo ngày liên hệ. */
export function buildLeadReport(input: { fb: FbRow[]; prospects: ProspectRow[]; logs: LogRow[]; from: string; to: string; names: Map<string, string> }): LeadReport {
  const { from, to, names } = input;
  const fb = buildGroup(input.fb.map((r) => ({ ...r, date: r.scanDate })), from, to, names);
  const pr = (origin: string) => buildGroup(input.prospects.filter((p) => p.origin === origin).map((p) => ({ ...p, date: p.foundDate })), from, to, names);

  const logs = input.logs.filter((l) => inRange(l.runDate, from, to));
  const byDay = new Map<string, { key: string; label: string; runs: number; ok: number; postsRead: number; newPosts: number }>();
  const runs = { runs: logs.length, ok: 0, failed: 0, groups: 0, postsRead: 0, newPosts: 0 };
  for (const l of logs) {
    const ok = isLogOk(l.status);
    const d = byDay.get(l.runDate) ?? { key: l.runDate, label: periodOf(l.runDate, "day").label, runs: 0, ok: 0, postsRead: 0, newPosts: 0 };
    d.runs++;
    if (ok) {
      runs.ok++;
      runs.groups += l.groups;
      runs.postsRead += l.postsRead;
      runs.newPosts += l.newPosts;
      d.ok++;
      d.postsRead += l.postsRead;
      d.newPosts += l.newPosts;
    } else runs.failed++;
    byDay.set(l.runDate, d);
  }
  return { from, to, fb, scan: pr("SCAN"), self: pr("SELF"), scanRuns: { ...runs, byDay: [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key)) } };
}
