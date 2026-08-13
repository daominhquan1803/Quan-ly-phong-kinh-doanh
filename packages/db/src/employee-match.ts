import { prisma } from "./index";

/** Bỏ dấu tiếng Việt, hạ chữ thường — dùng để so khớp tên nhân viên giữa các nguồn dữ liệu. */
function normalizeVN(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim()
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
