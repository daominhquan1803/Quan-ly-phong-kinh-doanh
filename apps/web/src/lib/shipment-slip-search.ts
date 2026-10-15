/**
 * Điều kiện tìm phiếu đi hàng — DÙNG CHUNG cho danh sách phiếu (GET /api/shipment-slips) và xuất Excel thống kê đi hàng
 * (GET /api/shipment-slips/export) để xuất ra đúng tập phiếu đang thấy khi gõ ô tìm kiếm (vd tìm "panasonic" -> xuất riêng khách đó).
 * Tìm theo số phiếu, tên khách, mã đơn hàng gắn phiếu, và theo DÒNG HÀNG (mã hàng, tên hàng, số PO bán, mã hàng của khách).
 */
export function slipItemMatch(q: string | undefined) {
  if (!q) return undefined;
  return {
    OR: [
      { itemCode: { contains: q, mode: "insensitive" as const } },
      { itemName: { contains: q, mode: "insensitive" as const } },
      { poSaleNumber: { contains: q, mode: "insensitive" as const } },
      { poCustomerItemCode: { contains: q, mode: "insensitive" as const } },
    ],
  };
}

export function slipSearchWhere(q: string | undefined) {
  if (!q) return {};
  return {
    OR: [
      { slipNumber: { contains: q, mode: "insensitive" as const } },
      { customerName: { contains: q, mode: "insensitive" as const } },
      { order: { orderCode: { contains: q, mode: "insensitive" as const } } },
      { items: { some: slipItemMatch(q) } },
    ],
  };
}

const has = (hay: string | null | undefined, needle: string) => (hay ?? "").toLowerCase().includes(needle.toLowerCase());

/** Phiếu khớp ở CHÍNH phiếu (số phiếu / tên khách / mã đơn) — khi đó lấy mọi dòng hàng của phiếu. */
export function slipMatchesQuery(q: string, slip: { slipNumber: string; customerName: string | null; order: { orderCode: string } | null }): boolean {
  return has(slip.slipNumber, q) || has(slip.customerName, q) || has(slip.order?.orderCode, q);
}

/** Dòng hàng khớp từ khoá — khi phiếu chỉ khớp qua dòng hàng thì chỉ lấy đúng các dòng này. */
export function itemMatchesQuery(
  q: string,
  it: { itemCode: string | null; itemName: string; poSaleNumber: string | null; poCustomerItemCode?: string | null }
): boolean {
  return has(it.itemCode, q) || has(it.itemName, q) || has(it.poSaleNumber, q) || has(it.poCustomerItemCode, q);
}

/** Phần tên file từ từ khoá tìm (bỏ dấu, chỉ chữ-số-gạch ngang, tối đa 30 ký tự). */
export function slugForFileName(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}
