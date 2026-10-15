/**
 * Đồng bộ KHÁCH HÀNG từ AMIS CRM (api/v2/Customers) vào bảng customers — CHỈ phần của các NVKD mình quản lý:
 *  - TẠO các khách AMIS đang do 1 NVKD (User có amisEmployeeCode + includeInSalesStats) phụ trách mà bảng customers CHƯA có
 *    (so theo mã đã chuẩn hoá: bỏ tiền tố "X." và dấu chấm cuối). Mã khách = đúng "Mã khách hàng" trên AMIS (vd "C.THONG NHAT"),
 *    tên = tên đầy đủ trên AMIS, NVKD = chủ sở hữu trên AMIS. KHÔNG nhập email/người liên hệ (tránh vô tình gửi thư nhắc nợ).
 *  - BÁO CÁO khác biệt tên và NVKD của khách đã có; chỉ GHI khi có cờ --update-names / --update-owners (AMIS là dữ liệu gốc).
 *  - Bỏ qua khách rác: "Người tiêu dùng" (mã NGUOITIEUDUNG*) và bản nháp ("NHAPS") — anh Quân chốt 15/10/2026.
 * Khách của phòng/NVKD khác trên AMIS bị bỏ qua (anh chỉ quản lý PKD1).
 *
 * Mặc định chỉ XEM (dry-run). Chạy trong container worker:
 *   docker compose exec worker npx tsx /repo/scripts/sync-customers-from-amis.ts
 *   ... --apply                    tạo khách còn thiếu
 *   ... --apply --skip=MA1,MA2     bỏ qua vài mã (so theo mã chuẩn hoá) khi tạo
 *   ... --apply --update-owners    cập nhật thêm NVKD theo AMIS cho khách đã có
 *   ... --apply --update-names     cập nhật thêm tên khách theo AMIS
 */
import { prisma, normalizeCustomerCode } from "@hoanggia/db";

const BASE = process.env.AMIS_BASE_URL || "https://crmconnect.misa.vn";
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const UPDATE_OWNERS = args.includes("--update-owners");
const UPDATE_NAMES = args.includes("--update-names");
const SKIP = new Set(
  (args.find((a) => a.startsWith("--skip="))?.slice(7) ?? "")
    .split(",")
    .map((s) => normalizeCustomerCode(s))
    .filter(Boolean)
);

interface AmisCustomer {
  account_number?: string;
  account_name?: string;
  owner_name?: string;
}

const stripVN = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();
const cleanName = (s: string) => s.replace(/\s+/g, " ").trim();
/** Khách rác trên AMIS: người tiêu dùng cuối và bản nháp — không đưa vào hệ thống. */
const isJunk = (code: string, name: string) => /^NGUOITIEUDUNG/i.test(code) || /^(NHAPS|Người tiêu dùng)$/i.test(name);
/** owner_name trên AMIS dạng "Phạm Thị Dung 0965615030 (PHAMDUNG)" — mã nhân viên AMIS nằm trong ngoặc cuối. */
const ownerCode = (o: string | undefined) => /\(([^)]+)\)\s*$/.exec(o ?? "")?.[1].trim().toUpperCase() ?? "";

async function fetchAllAmisCustomers(): Promise<AmisCustomer[]> {
  const appId = process.env.AMIS_APP_ID;
  const secret = process.env.AMIS_CLIENT_SECRET;
  if (!appId || !secret) throw new Error("Thiếu AMIS_APP_ID/AMIS_CLIENT_SECRET");
  const auth = await fetch(`${BASE}/api/v2/Account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: appId, client_secret: secret }),
  });
  const token = ((await auth.json()) as { data?: string }).data;
  if (!token) throw new Error("Không lấy được token AMIS");
  const all: AmisCustomer[] = [];
  for (let page = 1; page <= 100; page++) {
    const res = await fetch(`${BASE}/api/v2/Customers?page=${page}&pageSize=100&orderBy=created_date&isDescending=false`, {
      headers: { Authorization: `Bearer ${token}`, Clientid: appId },
    });
    const rows = ((await res.json()) as { data?: AmisCustomer[] }).data ?? [];
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}

async function main() {
  const amis = await fetchAllAmisCustomers();
  const users = await prisma.user.findMany({
    where: { active: true, amisEmployeeCode: { not: null }, includeInSalesStats: true },
    select: { id: true, name: true, amisEmployeeCode: true },
  });
  const userByCode = new Map(users.map((u) => [(u.amisEmployeeCode as string).toUpperCase(), u]));
  const ours = await prisma.customer.findMany({ select: { id: true, customerCode: true, customerName: true, salesEmployeeId: true } });
  const oursByNorm = new Map(ours.map((c) => [normalizeCustomerCode(c.customerCode), c]));
  const usedCodes = new Set(ours.map((c) => c.customerCode));

  const toCreate: { code: string; name: string; ownerId: string; ownerName: string }[] = [];
  const nameDiffs: { id: string; name: string; text: string }[] = [];
  const ownerDiffs: { id: string; text: string; ownerId: string }[] = [];
  const seen = new Set<string>();
  for (const a of amis) {
    const code = (a.account_number ?? "").trim();
    const name = cleanName(a.account_name ?? "");
    const norm = normalizeCustomerCode(code);
    if (!code || !name || !norm || seen.has(norm) || isJunk(code, name)) continue;
    seen.add(norm);
    const owner = userByCode.get(ownerCode(a.owner_name));
    if (!owner) continue; // khách của người/phòng khác — bỏ qua
    const existing = oursByNorm.get(norm);
    if (!existing) {
      if (SKIP.has(norm) || usedCodes.has(code)) continue;
      toCreate.push({ code, name, ownerId: owner.id, ownerName: owner.name });
      continue;
    }
    if (stripVN(existing.customerName) !== stripVN(name)) nameDiffs.push({ id: existing.id, name, text: `${existing.customerCode}: "${existing.customerName}" (ta) ≠ "${name}" (AMIS)` });
    if (existing.salesEmployeeId !== owner.id) ownerDiffs.push({ id: existing.id, ownerId: owner.id, text: `${existing.customerCode}: NVKD ta ≠ AMIS (${owner.name})` });
  }

  console.log(`AMIS: ${amis.length} khách | bảng customers: ${ours.length} khách | NVKD tính doanh số: ${users.map((u) => u.name).join(", ")}`);
  console.log(`\n[TẠO MỚI] ${toCreate.length} khách thuộc NVKD của mình, chưa có trong customers:`);
  for (const c of toCreate) console.log(`  + ${c.code} | ${c.name} | ${c.ownerName}`);
  console.log(`\n[KHÁC TÊN] ${nameDiffs.length} khách đã có nhưng tên khác AMIS ${UPDATE_NAMES ? "(sẽ cập nhật theo AMIS)" : "(KHÔNG tự sửa)"}:`);
  nameDiffs.forEach((t) => console.log(`  ~ ${t.text}`));
  console.log(`\n[KHÁC NVKD] ${ownerDiffs.length} khách đã có nhưng NVKD khác chủ sở hữu trên AMIS ${UPDATE_OWNERS ? "(sẽ cập nhật)" : "(KHÔNG tự sửa)"}:`);
  ownerDiffs.forEach((o) => console.log(`  ~ ${o.text}`));

  if (!APPLY) {
    console.log("\nDry-run — chưa ghi gì. Thêm --apply để tạo khách còn thiếu.");
    return;
  }
  let created = 0;
  for (const c of toCreate) {
    await prisma.customer.create({ data: { customerCode: c.code, customerName: c.name, salesEmployeeId: c.ownerId } });
    created++;
  }
  let names = 0;
  if (UPDATE_NAMES) {
    for (const n of nameDiffs) {
      await prisma.customer.update({ where: { id: n.id }, data: { customerName: n.name } });
      names++;
    }
  }
  let owners = 0;
  if (UPDATE_OWNERS) {
    for (const o of ownerDiffs) {
      await prisma.customer.update({ where: { id: o.id }, data: { salesEmployeeId: o.ownerId } });
      owners++;
    }
  }
  console.log(`\nĐã tạo ${created} khách${UPDATE_NAMES ? `, đổi tên ${names} khách` : ""}${UPDATE_OWNERS ? `, cập nhật NVKD ${owners} khách` : ""}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
