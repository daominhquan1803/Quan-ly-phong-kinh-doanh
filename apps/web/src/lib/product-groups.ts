/**
 * Nhóm sản phẩm cho báo cáo "khách đang mua gì" (anh Quân chốt 20/10/2026). Thứ tự xếp nhóm cho 1 dòng hàng:
 *  1) anh gán tay theo mã hàng (ItemGroupOverride);
 *  2) danh mục hàng AMIS (ProductInventory.categoryName) khi danh mục đó rõ nghĩa;
 *  3) từ khoá trong tên hàng;
 *  4) còn lại: "Khác" — liệt kê ở trang báo cáo để anh xếp nhóm 1 lần.
 */
export const PRODUCT_GROUPS = {
  TEM_NHAN: "Tem nhãn",
  TUI_NHUA: "Túi nhựa",
  MANG_PE: "Màng PE / màng–mảnh",
  BANG_DINH: "Băng dính",
  THUNG_HOP: "Thùng hộp giấy",
  HDSD: "HDSD / thẻ / tờ in",
  DAY_DAI: "Dây đai / cuộn",
  PALLET: "Pallet nhựa",
  MUC_IN: "Mực in / ribbon",
  CHONG_AM: "Hạt chống ẩm",
  GIA_CONG: "Gia công",
  KHAC: "Khác",
} as const;
export type GroupKey = keyof typeof PRODUCT_GROUPS;
export const GROUP_KEYS = Object.keys(PRODUCT_GROUPS) as GroupKey[];

const CATEGORY_GROUP: Record<string, GroupKey> = {
  "tem in thương mại": "TEM_NHAN",
  "sản xuất tem bế": "TEM_NHAN",
  "tem bế thương mại": "TEM_NHAN",
  "túi nylon": "TUI_NHUA",
  "sản xuất túi": "TUI_NHUA",
  "màng, mảnh": "MANG_PE",
  "sản xuất màng nhôm": "MANG_PE",
  "băng dính": "BANG_DINH",
  "thùng, hộp giấy": "THUNG_HOP",
  "tờ, quyển hdsd, thẻ": "HDSD",
  "dây đai, cuộn": "DAY_DAI",
  "nhóm hàng gia công": "GIA_CONG",
};

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

// Thứ tự quan trọng: mực in / chống ẩm trước túi, HDSD trước tem nhãn ("Tờ HDSD ... nhãn"), màng trước dây/cuộn ("cuộn ống PE", "cuộn màng").
const KEYWORDS: [GroupKey, RegExp][] = [
  ["GIA_CONG", /\bgia cong\b/],
  // Mực in mã vạch (wax/resin) và ruy băng: chỉ khi có từ đặc trưng, để "tem mực / loại mực" vẫn là tem nhãn.
  ["MUC_IN", /\bribbon\b|\bruy bang\b|\bwax\b|\bresin\b|\bmuc (in|wax)\b/],
  ["CHONG_AM", /chong am|hut am|silica/],
  ["HDSD", /\bhdsd\b|huong dan su dung|\bto (hd|huong|gap|roi|in)\b|\bquyen\b|\bthe (giay|treo|bao hanh|nhua|pvc)?\b|catalog|\bto roi\b/],
  ["BANG_DINH", /\bbang dinh\b|\bbang keo\b|\btape\b/],
  ["TUI_NHUA", /\btui\b|\bbao (pe|pp|opp|nilon|nylon|zip)\b/],
  ["MANG_PE", /\btam (pe|apet|pet|pp|xop)\b|\bmang\b|\bmanh\b|\bfilm\b|\bong pe\b|\bxop\b|\bfoam\b|bong khi|\bmang chit\b/],
  // Sau MANG_PE để "Màng PE cuốn pallet" vẫn là màng.
  ["PALLET", /\bpallet\b|\bpalet\b/],
  ["THUNG_HOP", /\bthung\b|\bhop\b|carton|\bgiay kraft\b|\bvach ngan\b/],
  ["DAY_DAI", /\bday dai\b|\bdai\b|\bday\b|\bcuon\b/],
  ["TEM_NHAN", /\btem\b|\bnhan\b|decal|sticker|label/],
];

export function groupByKeywords(itemName: string): GroupKey | null {
  const s = strip(itemName);
  for (const [g, re] of KEYWORDS) if (re.test(s)) return g;
  return null;
}

export function classifyItem(
  item: { itemCode: string | null; itemName: string },
  ctx: { override?: string | null; category?: string | null }
): GroupKey {
  if (ctx.override && ctx.override in PRODUCT_GROUPS) return ctx.override as GroupKey;
  const cat = ctx.category ? CATEGORY_GROUP[ctx.category.trim().toLowerCase()] : undefined;
  if (cat) return cat;
  return groupByKeywords(item.itemName) ?? "KHAC";
}

/** "Tem nhãn 62% · Túi nhựa 30%" — chỉ nhóm chiếm từ 5%. */
export function groupsText(values: Partial<Record<GroupKey, number>>): string {
  const total = Object.values(values).reduce((s, v) => s + (v ?? 0), 0);
  if (total <= 0) return "";
  return (Object.entries(values) as [GroupKey, number][])
    .filter(([, v]) => v / total >= 0.05)
    .sort((a, b) => b[1] - a[1])
    .map(([g, v]) => `${PRODUCT_GROUPS[g]} ${Math.round((v / total) * 100)}%`)
    .join(" · ");
}
