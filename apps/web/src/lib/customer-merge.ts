import { prisma, normalizeCustomerCode } from "@hoanggia/db";
import { companyKey } from "./lead-care";

/**
 * Gộp / khoá tạm khách trùng (anh Quân chốt 27/11/2026). Hồ sơ phụ KHÔNG bị xoá (để AMIS không tạo lại) mà trỏ sang hồ sơ chính;
 * hoá đơn và đơn hàng giữ nguyên mã kế toán, các báo cáo khách hàng/chăm sóc tính chung vào hồ sơ chính.
 */

/** Điều kiện Prisma: khách đang dùng (không bị khoá tạm, không phải hồ sơ phụ đã gộp). */
export const VISIBLE_CUSTOMER = { mergedIntoId: null, lockedAt: null };

/** Mã + tên của các hồ sơ phụ, để đơn hàng/công nợ mang mã cũ vẫn tính vào hồ sơ chính. `ids` = chỉ lấy phụ của các hồ sơ chính này. */
export async function loadAliases(ids?: string[]) {
  const rows = await prisma.customer.findMany({
    where: { mergedIntoId: ids ? { in: ids } : { not: null } },
    select: { customerCode: true, customerName: true, mergedIntoId: true },
  });
  return rows.flatMap((r) => (r.mergedIntoId ? [{ code: normalizeCustomerCode(r.customerCode), name: r.customerName.trim(), primaryId: r.mergedIntoId }] : []));
}

/** Các nhóm hồ sơ trùng tên (từ 2 hồ sơ). Chỉ gợi ý — người dùng tự quyết gộp (chi nhánh có thể trùng tên). */
export function duplicateGroups<T extends { customerName: string }>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = companyKey(r.customerName);
    if (k) groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

// Chỉ ô hồ sơ. Không chép email / thời hạn công nợ: hai ô này quyết định thư nhắc nợ gửi ra ngoài và hạn thanh toán hoá đơn.
const FILL_FIELDS = [
  "contactPerson", "address", "province", "industry", "staffSize", "ownership", "contactPhone",
  "competitors", "potentialYear", "painPoint", "stage", "stageUpdatedAt", "salesEmployeeId",
] as const;

/** Giá trị cần điền vào ô còn trống của hồ sơ chính, lấy từ hồ sơ phụ đầu tiên có dữ liệu. */
export function mergeFill(primary: Record<string, unknown>, secondaries: Record<string, unknown>[]): Record<string, unknown> {
  const fill: Record<string, unknown> = {};
  for (const f of FILL_FIELDS) {
    if (primary[f] != null && primary[f] !== "") continue;
    const from = secondaries.find((s) => s[f] != null && s[f] !== "");
    if (from) fill[f] = from[f];
  }
  return fill;
}

/** Mô tả dữ liệu đang gắn với khách; rỗng = được phép xoá hẳn. */
export async function customerDataSummary(customer: { id: string; customerCode: string }): Promise<string[]> {
  const { id } = customer;
  const code = normalizeCustomerCode(customer.customerCode);
  // Lọc thô bằng "chứa mã" rồi so mã đã chuẩn hoá (dữ liệu gốc có thể còn tiền tố "T.", dấu chấm cuối).
  const args = { where: { customerCode: { contains: code, mode: "insensitive" as const } }, distinct: ["customerCode" as const], select: { customerCode: true as const } };
  const sameCode = (rows: { customerCode: string | null }[]) => rows.some((r) => normalizeCustomerCode(r.customerCode) === code);

  const [care, stages, trips, merged, invoices, orders, payments, po, slips, defects] = await Promise.all([
    prisma.customerCareLog.count({ where: { customerId: id } }),
    prisma.customerStageHistory.count({ where: { customerId: id } }),
    prisma.businessTripStop.count({ where: { customerId: id } }),
    prisma.customer.count({ where: { mergedIntoId: id } }),
    prisma.debtInvoice.findMany(args),
    prisma.order.findMany(args),
    prisma.debtPayment.findMany(args),
    prisma.poTrackingLine.findMany(args),
    prisma.pickingSlip.findMany(args),
    prisma.defectReport.findMany(args),
  ]);

  return [
    care > 0 && "lịch sử chăm sóc",
    stages > 0 && "lịch sử tiến trình",
    trips > 0 && "lịch công tác",
    merged > 0 && "hồ sơ đã gộp vào",
    sameCode(invoices) && "hoá đơn công nợ",
    sameCode(orders) && "đơn hàng",
    sameCode(payments) && "tiền về",
    sameCode(po) && "theo dõi PO",
    sameCode(slips) && "phiếu soạn hàng",
    sameCode(defects) && "báo cáo hàng lỗi",
  ].filter((x): x is string => !!x);
}
