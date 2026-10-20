import ExcelJS from "exceljs";
import { prisma } from "@hoanggia/db";
import { INDUSTRIES, OWNERSHIPS, STAFF_SIZES, STAGES, keyOfLabel } from "@/lib/customer-profile";
import { LIST_COLUMNS, LIST_SHEET } from "@/lib/customer-report-workbook";
import type { CustomerReportRow } from "@/lib/customer-report";

/**
 * Nhập lại file Excel báo cáo Danh sách khách hàng: chỉ đọc các cột NVKD sửa được (tiêu đề cam), so với dữ liệu hiện tại
 * (kể cả địa chỉ tự lấy từ AMIS) và chỉ ghi phần THAY ĐỔI. Ô để trống = không đổi (không xoá dữ liệu đang có).
 */
export const EDITABLE_FIELDS = ["address", "province", "industry", "staffSize", "ownership", "contactPerson", "contactPhone", "potentialYear", "competitors", "stage", "painPoint"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
export const FIELD_LABEL: Record<EditableField, string> = {
  address: "Địa chỉ",
  province: "Tỉnh / TP",
  industry: "Ngành nghề",
  staffSize: "Quy mô",
  ownership: "Loại hình",
  contactPerson: "Người liên hệ",
  contactPhone: "SĐT",
  potentialYear: "Tiềm năng/năm",
  competitors: "Đối thủ",
  stage: "Tiến trình",
  painPoint: "Khó khăn",
};

export interface ImportChange {
  customerId: string;
  customerCode: string;
  customerName: string;
  field: EditableField;
  from: string | number | null;
  to: string | number;
}
export interface ImportResult {
  rowsRead: number;
  changes: ImportChange[];
  errors: string[];
}

const text = (v: ExcelJS.CellValue): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("").trim() || null;
    if ("text" in v) return String(v.text).trim() || null;
    if ("result" in v) return v.result == null ? null : String(v.result).trim() || null;
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim() || null;
};
const num = (s: string | null): number | null | undefined => {
  if (s == null) return undefined;
  const n = Number(s.replace(/[.,\s](?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/** Đọc + so sánh, chưa ghi. `current` = dữ liệu báo cáo theo phạm vi người nhập (NVKD chỉ khách của mình). */
export async function diffImport(buffer: Buffer, current: CustomerReportRow[]): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.getWorksheet(LIST_SHEET) ?? wb.worksheets.find((s) => findHeader(s) > 0);
  if (!ws) return { rowsRead: 0, changes: [], errors: [`Không thấy sheet "${LIST_SHEET}" (cột "Mã KH") trong file.`] };
  const headerRow = findHeader(ws);
  if (headerRow < 1) return { rowsRead: 0, changes: [], errors: ['Không thấy dòng tiêu đề có cột "Mã KH".'] };

  const colByKey = new Map<string, number>();
  ws.getRow(headerRow).eachCell((cell, col) => {
    const h = text(cell.value);
    const def = LIST_COLUMNS.find((c) => c.header === h);
    if (def) colByKey.set(def.key, col);
  });
  const codeCol = colByKey.get("code")!;
  const byCode = new Map(current.map((r) => [r.customerCode.trim().toUpperCase(), r]));
  const changes: ImportChange[] = [];
  const errors: string[] = [];
  let rowsRead = 0;

  for (let rn = headerRow + 1; rn <= ws.rowCount; rn++) {
    const row = ws.getRow(rn);
    const code = text(row.getCell(codeCol).value);
    if (!code) continue;
    rowsRead++;
    const cur = byCode.get(code.toUpperCase());
    if (!cur) {
      errors.push(`Dòng ${rn}: mã ${code} không có hoặc không thuộc khách bạn phụ trách — bỏ qua.`);
      continue;
    }
    const get = (key: string) => (colByKey.has(key) ? text(row.getCell(colByKey.get(key)!).value) : null);
    const push = (field: EditableField, from: string | number | null, to: string | number | null | undefined, label?: string) => {
      if (to === undefined || to === null || to === "") return;
      if (String(from ?? "") === String(to)) return;
      changes.push({ customerId: cur.id, customerCode: cur.customerCode, customerName: cur.customerName, field, from, to: label ? to : to });
    };
    const pick = <T extends Record<string, string>>(field: EditableField, map: T, key: string, curVal: string | null) => {
      const raw = get(key);
      if (raw == null) return;
      const k = keyOfLabel(map, raw);
      if (k === undefined) errors.push(`Dòng ${rn} (${code}): "${raw}" không có trong danh sách ${FIELD_LABEL[field]} — bỏ qua ô này.`);
      else if (k !== null) push(field, curVal, k as string);
    };
    push("address", cur.address, get("address"));
    push("province", cur.province, get("province"));
    pick("industry", INDUSTRIES, "industry", cur.industry);
    pick("staffSize", STAFF_SIZES, "staffSize", cur.staffSize);
    pick("ownership", OWNERSHIPS, "ownership", cur.ownership);
    push("contactPerson", cur.contactPerson, get("contactPerson"));
    push("contactPhone", cur.contactPhone, get("contactPhone"));
    const pv = get("potentialYear");
    const n = num(pv);
    if (n === null) errors.push(`Dòng ${rn} (${code}): tiềm năng/năm "${pv}" không phải số — bỏ qua ô này.`);
    else if (n !== undefined && n > 0) push("potentialYear", cur.potentialYear, n);
    push("competitors", cur.competitors, get("competitors"));
    pick("stage", STAGES, "stage", cur.stage);
    push("painPoint", cur.painPoint, get("painPoint"));
  }
  return { rowsRead, changes, errors };
}

function findHeader(ws: ExcelJS.Worksheet): number {
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    let hit = false;
    ws.getRow(r).eachCell((c) => {
      if (text(c.value) === "Mã KH") hit = true;
    });
    if (hit) return r;
  }
  return -1;
}

/** Ghi các thay đổi đã xem trước (gom theo khách); đổi tiến trình thì lưu lịch sử. */
export async function applyImport(changes: ImportChange[], userId: string, source: "APP" | "EXCEL" = "EXCEL"): Promise<number> {
  const byCustomer = new Map<string, ImportChange[]>();
  for (const c of changes) (byCustomer.get(c.customerId) ?? byCustomer.set(c.customerId, []).get(c.customerId)!).push(c);
  const now = new Date();
  for (const [customerId, cs] of byCustomer) {
    const data: Record<string, unknown> = { profileUpdatedAt: now };
    for (const c of cs) data[c.field] = c.to;
    const stage = cs.find((c) => c.field === "stage");
    if (stage) data.stageUpdatedAt = now;
    await prisma.$transaction(async (tx) => {
      const before = stage ? await tx.customer.findUnique({ where: { id: customerId }, select: { stage: true } }) : null;
      await tx.customer.update({ where: { id: customerId }, data });
      if (stage && before?.stage !== stage.to) {
        await tx.customerStageHistory.create({ data: { customerId, fromStage: before?.stage ?? null, toStage: String(stage.to), changedById: userId, source } });
      }
    });
  }
  return byCustomer.size;
}
