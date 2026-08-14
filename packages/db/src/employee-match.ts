import { prisma } from "./index";

/** Bỏ dấu tiếng Việt, hạ chữ thường — dùng để so khớp tên nhân viên/trạng thái giữa các nguồn dữ liệu. */
export function normalizeVN(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim()
    // Bỏ dấu chấm/phẩy cuối tên (vd file Excel gõ nhầm "Ngô Thanh Tùng." có dấu chấm) để
    // không làm khớp tên bị trượt vì khác biệt không đáng kể.
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * AMIS trả tên người phụ trách dạng "Đặng Văn Tấn_0984.253.666 (DANGTAN)" —
 * hàm này tách lấy phần tên hiển thị để so khớp theo tên khi chưa có mã nhân viên.
 */
export function extractNameFromAmisLabel(label: string): string {
  return label.split("_")[0].trim();
}

/** Khớp nhân viên qua mã AMIS (chính xác nhất — điền tại trang Nhân viên). */
export async function resolveEmployeeIdByCode(amisEmployeeCode: string | null): Promise<string | null> {
  if (!amisEmployeeCode) return null;
  const user = await prisma.user.findUnique({ where: { amisEmployeeCode } });
  return user?.id ?? null;
}

/**
 * Danh sách mã nhân viên AMIS đang được quản lý trong hệ thống (nhân viên active, đã
 * gán mã AMIS tại trang Nhân viên) — dùng để giới hạn phạm vi đồng bộ đơn hàng chỉ lấy
 * đúng đội ngũ đang quản lý, không kéo toàn bộ đơn hàng của cả công ty trên AMIS.
 */
export async function getManagedAmisEmployeeCodes(): Promise<Set<string>> {
  const users = await prisma.user.findMany({
    where: { active: true, amisEmployeeCode: { not: null } },
    select: { amisEmployeeCode: true },
  });
  return new Set(users.map((u) => u.amisEmployeeCode as string));
}

/**
 * Khớp nhân viên qua tên (alias đã lưu, hoặc tên khớp chính xác) — dùng làm phương án
 * dự phòng khi chưa gán mã AMIS cho tài khoản.
 */
export async function resolveEmployeeIdByName(rawName: string | null): Promise<string | null> {
  if (!rawName?.trim()) return null;
  const norm = normalizeVN(rawName);

  const [aliases, employees] = await Promise.all([
    prisma.employeeAlias.findMany(),
    prisma.user.findMany({ where: { role: "SALES" }, select: { id: true, name: true } }),
  ]);

  const alias = aliases.find((a) => normalizeVN(a.aliasName) === norm);
  if (alias) return alias.employeeId;

  const exact = employees.find((e) => normalizeVN(e.name) === norm);
  return exact?.id ?? null;
}
