import { prisma, normalizeCustomerCode } from "@hoanggia/db";
import { logger } from "../logger";
import { getAmisToken, type SyncOutcome } from "./amis";

const AMIS_BASE_URL = process.env.AMIS_BASE_URL || "https://crmconnect.misa.vn";

/** Khách hàng AMIS CRM ("GET /api/v2/Customers") — chỉ các trường dùng tới. */
export interface AmisCustomer {
  account_number: string | null;
  account_name: string | null;
  owner_name: string | null; // "Lê Đình Hiếu (LEHIEU)" — mã nhân viên AMIS nằm trong ngoặc cuối
  office_tel: string | null;
  billing_address: string | null;
  inactive: boolean | null;
}

export interface PlanUser {
  id: string;
  amisEmployeeCode: string;
}

export interface ExistingCustomer {
  customerCode: string;
  salesEmployeeId: string | null;
  address: string | null;
  contactPhone: string | null;
}

export interface CustomerCreate {
  customerCode: string;
  customerName: string;
  salesEmployeeId: string;
  address: string | null;
  contactPhone: string | null;
}

export interface CustomerUpdate {
  customerCode: string;
  data: { salesEmployeeId?: string; address?: string; contactPhone?: string };
}

export interface CustomerSyncPlan {
  creates: CustomerCreate[];
  updates: CustomerUpdate[];
  /** Khách AMIS chưa có trong app mà người phụ trách không phải NVKD đang quản lý -> không tạo. */
  skippedNotManaged: number;
  /** Nhãn người phụ trách chưa ghép được -> số khách (để anh biết cần gán mã AMIS cho ai). */
  unmappedOwners: Record<string, number>;
}

/** Mã trong ngoặc cuối nhãn: "Lê Đình Hiếu (LEHIEU)" -> "LEHIEU". */
export function ownerCodeFromLabel(label: string | null): string | null {
  const m = label?.match(/\(([^()]+)\)\s*$/);
  return m ? m[1].trim() : null;
}

/** Khách rác trên AMIS: người tiêu dùng cuối và bản nháp — không đưa vào hệ thống (anh Quân chốt 15/10/2026). */
export function isJunkCustomer(code: string, name: string): boolean {
  return /^NGUOITIEUDUNG/i.test(code) || /^(NHAPS|Người tiêu dùng)$/i.test(name);
}

function clean(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().replace(/\s+/g, " ");
  return s || null;
}

/**
 * Thuần: từ danh sách khách AMIS + khách đã có trong app + NVKD đang quản lý, lập kế hoạch tạo/cập nhật.
 *  - Khách chưa có trong app: tạo nếu người phụ trách là NVKD đang quản lý (ghép theo mã AMIS trong ngoặc); bỏ khách rác và khách ngừng.
 *  - Khách đã có: chỉ điền chỗ TRỐNG (NVKD, địa chỉ, SĐT), không ghi đè dữ liệu đã nhập.
 * Mã khách chuẩn hoá như hoá đơn (bỏ tiền tố "T.", "C." và dấu chấm cuối). Trùng mã sau chuẩn hoá: dòng đầu tiên thắng
 * (AMIS trả theo modified_date giảm dần nên đó là bản mới nhất). KHÔNG lấy email/người liên hệ (email dùng gửi thư nhắc nợ ra ngoài).
 */
export function planCustomerSync(rows: AmisCustomer[], existing: ExistingCustomer[], users: PlanUser[]): CustomerSyncPlan {
  const byCode = new Map(users.map((u) => [u.amisEmployeeCode.trim().toUpperCase(), u.id]));
  const existingByCode = new Map(existing.map((c) => [normalizeCustomerCode(c.customerCode), c]));
  const seen = new Set<string>();
  const plan: CustomerSyncPlan = { creates: [], updates: [], skippedNotManaged: 0, unmappedOwners: {} };

  for (const r of rows) {
    const rawCode = (r.account_number ?? "").trim();
    const customerName = clean(r.account_name);
    const customerCode = normalizeCustomerCode(rawCode);
    if (!customerCode || !customerName || seen.has(customerCode) || isJunkCustomer(rawCode, customerName)) continue;
    seen.add(customerCode);

    const ownerCode = ownerCodeFromLabel(r.owner_name)?.toUpperCase();
    const salesEmployeeId = ownerCode ? byCode.get(ownerCode) ?? null : null;
    const address = clean(r.billing_address);
    const contactPhone = clean(r.office_tel);
    const cur = existingByCode.get(customerCode);

    if (cur) {
      const data: CustomerUpdate["data"] = {};
      if (!cur.salesEmployeeId && salesEmployeeId) data.salesEmployeeId = salesEmployeeId;
      if (!cur.address && address) data.address = address;
      if (!cur.contactPhone && contactPhone) data.contactPhone = contactPhone;
      if (Object.keys(data).length > 0) plan.updates.push({ customerCode: cur.customerCode, data });
      continue;
    }

    if (r.inactive || !salesEmployeeId) {
      plan.skippedNotManaged++;
      if (!salesEmployeeId) {
        const label = clean(r.owner_name) ?? "(chưa có người phụ trách)";
        plan.unmappedOwners[label] = (plan.unmappedOwners[label] ?? 0) + 1;
      }
      continue;
    }
    plan.creates.push({ customerCode, customerName, salesEmployeeId, address, contactPhone });
  }
  return plan;
}

async function fetchCustomersPage(token: string, appId: string, page: number, pageSize: number): Promise<AmisCustomer[]> {
  const url = `${AMIS_BASE_URL}/api/v2/Customers?page=${page}&pageSize=${pageSize}&orderBy=modified_date&isDescending=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Clientid: appId } });
  const json = (await res.json()) as { data?: AmisCustomer[] | null; error_message?: string | null };
  if (!res.ok || !Array.isArray(json.data)) {
    throw new Error(json.error_message || `Gọi AMIS Customers thất bại (HTTP ${res.status})`);
  }
  return json.data;
}

/**
 * Đồng bộ danh sách khách hàng từ AMIS CRM (chỉ đọc) vào trang Khách hàng. Chạy hằng ngày 06:20 và khi ADMIN bấm nút.
 * Chỉ phần của NVKD đang quản lý (active, có mã AMIS, tính doanh số). Khách mới được tạo; khách đã có chỉ điền chỗ trống.
 */
export async function runAmisCustomerSync(triggeredBy: string): Promise<SyncOutcome> {
  const log = await prisma.syncLog.create({ data: { jobType: "AMIS_CUSTOMER_SYNC", status: "RUNNING", triggeredBy } });
  try {
    const appId = process.env.AMIS_APP_ID;
    const clientSecret = process.env.AMIS_CLIENT_SECRET;
    if (!appId || !clientSecret) throw new Error("Thiếu AMIS_APP_ID/AMIS_CLIENT_SECRET trong biến môi trường của worker");

    const users = (
      await prisma.user.findMany({
        where: { active: true, amisEmployeeCode: { not: null }, includeInSalesStats: true },
        select: { id: true, amisEmployeeCode: true },
      })
    ).flatMap((u) => (u.amisEmployeeCode ? [{ id: u.id, amisEmployeeCode: u.amisEmployeeCode }] : []));
    if (users.length === 0) throw new Error("Chưa có nhân viên nào được gán mã AMIS và tính doanh số — vào trang Nhân viên trước khi đồng bộ");

    const token = await getAmisToken(appId, clientSecret);
    const pageSize = 100;
    const rows: AmisCustomer[] = [];
    for (let page = 0; page < 200; page++) {
      const batch = await fetchCustomersPage(token, appId, page, pageSize);
      rows.push(...batch);
      if (batch.length < pageSize) break;
      await new Promise((r) => setTimeout(r, 300)); // nhẹ tay với AMIS
    }

    const existing = await prisma.customer.findMany({ select: { customerCode: true, salesEmployeeId: true, address: true, contactPhone: true } });
    const plan = planCustomerSync(rows, existing, users);

    const assigned = new Map<string, string>(); // khách vừa có NVKD -> gán cho hoá đơn công nợ đang trống NVKD
    for (const c of plan.creates) {
      await prisma.customer.create({ data: c });
      assigned.set(c.customerCode, c.salesEmployeeId);
    }
    for (const u of plan.updates) {
      await prisma.customer.update({ where: { customerCode: u.customerCode }, data: u.data });
      if (u.data.salesEmployeeId) assigned.set(u.customerCode, u.data.salesEmployeeId);
    }
    let invoicesAssigned = 0;
    for (const [customerCode, salesEmployeeId] of assigned) {
      const res = await prisma.debtInvoice.updateMany({ where: { customerCode, salesEmployeeId: null }, data: { salesEmployeeId } });
      invoicesAssigned += res.count;
    }

    const topUnmapped = Object.entries(plan.unmappedOwners)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label, n]) => `${label}: ${n}`)
      .join("; ");
    const message =
      `Khách AMIS: rà ${rows.length}, tạo mới ${plan.creates.length}, điền chỗ trống ${plan.updates.length} khách, ` +
      `gán NVKD cho ${invoicesAssigned} hoá đơn, bỏ qua ${plan.skippedNotManaged} khách chưa thuộc NVKD đang quản lý` +
      (topUnmapped ? ` (người phụ trách chưa ghép: ${topUnmapped})` : "");
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "SUCCESS", finishedAt: new Date(), recordsSynced: plan.creates.length + plan.updates.length, message },
    });
    logger.info(message);
    return { status: "SUCCESS", recordsSynced: plan.creates.length + plan.updates.length, message };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    logger.error("Đồng bộ khách hàng từ AMIS thất bại:", message);
    await prisma.syncLog.update({ where: { id: log.id }, data: { status: "FAILED", finishedAt: new Date(), message } });
    return { status: "FAILED", recordsSynced: 0, message };
  }
}
