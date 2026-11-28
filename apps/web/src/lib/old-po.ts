import { prisma } from "@hoanggia/db";
import { progressFor } from "@/lib/production-match";

/**
 * Trang sản xuất có dữ liệu từ ngày này. Cố định (không lấy ngày lệnh sớm nhất) để một lệnh ghi sai ngày hoặc dữ
 * liệu cũ bị xoá không làm số trễ đổi ngầm.
 */
const PRODUCTION_DATA_SINCE = new Date("2026-10-12");
/** Chưa đồng bộ lần nào thì chưa áp dụng mốc. */
export const dataSinceOf = (rows: unknown[]) => (rows.length ? PRODUCTION_DATA_SINCE : null);

/**
 * Bộ lọc cho thống kê trễ: dòng HÀNG SẢN XUẤT đặt trước khi trang sản xuất có dữ liệu và không có lệnh thì không
 * tính trễ (PO cũ đã giao nhưng chưa đóng trên app). Hàng thương mại vẫn tính trễ như thường.
 */
export async function loadOldPoFilter() {
  const rows = await prisma.productionLine.findMany();
  const dataSince = dataSinceOf(rows);
  let count = 0;
  return {
    ignore(line: { poCode: string; itemCode: string | null; poDate: Date | null }) {
      const old = progressFor(line, rows, null, "", dataSince).status === "OLD_PO";
      if (old) count++;
      return old;
    },
    /** Số dòng đã bỏ khỏi thống kê trễ (đọc SAU khi đã lọc). */
    count: () => count,
  };
}
