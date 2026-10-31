import { normalizeVN } from "./text-normalize";

/** 34 tỉnh/TP hiện hành (sau sáp nhập 2025) — danh sách chọn Tỉnh/TP của chuyến công tác. */
export const PROVINCES = [
  "An Giang", "Bắc Ninh", "Cà Mau", "Cao Bằng", "Cần Thơ", "Đà Nẵng", "Đắk Lắk", "Điện Biên", "Đồng Nai", "Đồng Tháp",
  "Gia Lai", "Hà Nội", "Hà Tĩnh", "Hải Phòng", "Huế", "Hưng Yên", "Khánh Hòa", "Lai Châu", "Lạng Sơn", "Lào Cai",
  "Lâm Đồng", "Nghệ An", "Ninh Bình", "Phú Thọ", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị", "Sơn La", "Tây Ninh", "Thái Nguyên",
  "Thanh Hóa", "TP. Hồ Chí Minh", "Tuyên Quang", "Vĩnh Long",
] as const;

/** Tên tỉnh cũ (trước sáp nhập 2025) -> tỉnh/TP hiện hành. Địa chỉ khách trong dữ liệu có thể còn ghi tỉnh cũ. */
const OLD_TO_NEW: Record<string, string> = {
  "ha giang": "Tuyên Quang",
  "yen bai": "Lào Cai",
  "bac kan": "Thái Nguyên",
  "vinh phuc": "Phú Thọ",
  "hoa binh": "Phú Thọ",
  "bac giang": "Bắc Ninh",
  "thai binh": "Hưng Yên",
  "hai duong": "Hải Phòng",
  "ha nam": "Ninh Bình",
  "nam dinh": "Ninh Bình",
  "quang binh": "Quảng Trị",
  "quang nam": "Đà Nẵng",
  "kon tum": "Quảng Ngãi",
  "binh dinh": "Gia Lai",
  "ninh thuan": "Khánh Hòa",
  "dak nong": "Lâm Đồng",
  "binh thuan": "Lâm Đồng",
  "phu yen": "Đắk Lắk",
  "ba ria vung tau": "TP. Hồ Chí Minh",
  "ba ria - vung tau": "TP. Hồ Chí Minh",
  "binh duong": "TP. Hồ Chí Minh",
  "binh phuoc": "Đồng Nai",
  "long an": "Tây Ninh",
  "tien giang": "Đồng Tháp",
  "ben tre": "Vĩnh Long",
  "tra vinh": "Vĩnh Long",
  "soc trang": "Cần Thơ",
  "hau giang": "Cần Thơ",
  "bac lieu": "Cà Mau",
  "kien giang": "An Giang",
  "thua thien hue": "Huế",
  "thua thien - hue": "Huế",
  "ho chi minh": "TP. Hồ Chí Minh",
  "hcm": "TP. Hồ Chí Minh",
  "sai gon": "TP. Hồ Chí Minh",
};

const BY_NORM = new Map<string, string>(PROVINCES.map((p) => [normalizeVN(p).replace(/^tp\.? /, ""), p]));

/** Tên tỉnh/TP chuẩn hiện hành từ chuỗi bất kỳ ("Tỉnh Thái Bình" -> "Hưng Yên"); không nhận ra -> null. */
export function canonicalProvince(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = normalizeVN(name)
    .replace(/^(tinh|thanh pho|tp)\.?\s+/, "")
    .replace(/\s+viet nam$/, "")
    .trim();
  if (!n) return null;
  return BY_NORM.get(n) ?? OLD_TO_NEW[n] ?? null;
}

export function sameProvince(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonicalProvince(a);
  return !!ca && ca === canonicalProvince(b);
}
