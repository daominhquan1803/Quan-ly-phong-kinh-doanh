/** Đếm biên bản hàng lỗi đang mở cần xử lý (banner đầu trang Báo cáo hàng lỗi). Không import DB — dùng được ở client. */
export function summarizeOpenDefects(open: { respondedAt: string | null; replacements: unknown[] }[]) {
  return {
    total: open.length,
    // chưa phản hồi khách lần đầu (hạn 24h — KPI Admin)
    unresponded: open.filter((d) => !d.respondedAt).length,
    // đã nối ít nhất 1 phiếu đổi lỗi nhưng chưa đủ SL
    partlyReplaced: open.filter((d) => d.replacements.length > 0).length,
  };
}
