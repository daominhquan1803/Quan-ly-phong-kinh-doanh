/** Bỏ dấu tiếng Việt, hạ chữ thường, trim khoảng trắng thừa — dùng để so khớp header Excel. */
export function normalizeVN(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Điểm tương đồng đơn giản 0..1 giữa 2 chuỗi đã chuẩn hoá (dựa trên token overlap). */
export function similarity(a: string, b: string): number {
  const na = normalizeVN(a);
  const nb = normalizeVN(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  const tokensA = new Set(na.split(" "));
  const tokensB = new Set(nb.split(" "));
  let overlap = 0;
  for (const t of tokensA) if (tokensB.has(t)) overlap++;
  return overlap / Math.max(tokensA.size, tokensB.size);
}
