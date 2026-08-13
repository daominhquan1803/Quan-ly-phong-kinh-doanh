import {
  prisma,
  OrderStatus,
  resolveEmployeeIdByCode,
  resolveEmployeeIdByName,
  extractNameFromAmisLabel,
} from "@hoanggia/db";
import { logger } from "../logger";

const AMIS_BASE_URL = process.env.AMIS_BASE_URL || "https://crmconnect.misa.vn";

export interface SyncOutcome {
  status: "SUCCESS" | "FAILED";
  recordsSynced: number;
  message?: string;
}

interface AmisProductMapping {
  product_code?: string;
  custom_field3?: string | null; // "Số PO/Mã hàng KH" theo mẫu phiếu Hoàng Gia
}

interface AmisSaleOrder {
  id: number;
  sale_order_no: string;
  account_name: string | null;
  account_code: string | null;
  sale_order_date: string | null;
  deadline_date: string | null;
  status: string | null;
  delivery_status: string | null;
  sale_order_amount: number | null;
  total_summary: number | null;
  employee_code: string | null;
  recorded_sale_users_name: string | null;
  owner_name: string | null;
  modified_date: string;
  is_deleted: boolean | null;
  sale_order_product_mappings: AmisProductMapping[] | null;
}

interface AmisListResponse {
  success: boolean;
  code: number;
  data: AmisSaleOrder[] | null;
  error_message?: string | null;
}

/** Đăng nhập bằng AppID + mã bảo mật, trả về Bearer token — xem crmconnect.misa.vn/docs-v2. */
async function getAmisToken(appId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${AMIS_BASE_URL}/api/v2/Account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: appId, client_secret: clientSecret }),
  });
  const json = (await res.json()) as { success: boolean; data?: string; user_msg?: string };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.user_msg || "Không lấy được token AMIS — kiểm tra lại AppID/mã bảo mật");
  }
  return json.data;
}

async function fetchSaleOrdersPage(
  token: string,
  appId: string,
  page: number,
  pageSize: number
): Promise<AmisSaleOrder[]> {
  const url = `${AMIS_BASE_URL}/api/v2/SaleOrders?page=${page}&pageSize=${pageSize}&orderBy=modified_date&isDescending=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Clientid: appId },
  });
  const json = (await res.json()) as AmisListResponse;
  if (!res.ok || !json.success) {
    throw new Error(json.error_message || `Gọi AMIS SaleOrders thất bại (HTTP ${res.status})`);
  }
  return json.data ?? [];
}

/**
 * AMIS dùng "status" (Chưa/Đang thực hiện) và "delivery_status" (Chưa/Đang/Đã giao hàng) —
 * ưu tiên delivery_status vì gần với khái niệm "quá hạn giao hàng" của hệ thống mình hơn.
 */
function mapAmisStatus(deliveryStatus: string | null, status: string | null): OrderStatus {
  if (deliveryStatus === "Đã giao hàng") return OrderStatus.DELIVERED;
  if (deliveryStatus === "Đang giao hàng") return OrderStatus.PARTIAL_DELIVERED;
  if (status === "Đang thực hiện") return OrderStatus.CONFIRMED;
  return OrderStatus.NEW;
}

async function upsertOrderFromAmis(o: AmisSaleOrder, unmatchedEmployeeCodes: Set<string>) {
  let salesEmployeeId = await resolveEmployeeIdByCode(o.employee_code);
  const rawNameLabel = o.recorded_sale_users_name || o.owner_name || null;
  const salesEmployeeNameRaw = rawNameLabel ? extractNameFromAmisLabel(rawNameLabel) : null;

  if (!salesEmployeeId && salesEmployeeNameRaw) {
    salesEmployeeId = await resolveEmployeeIdByName(salesEmployeeNameRaw);
  }
  if (!salesEmployeeId && o.employee_code) {
    unmatchedEmployeeCodes.add(o.employee_code);
  }

  const firstItem = o.sale_order_product_mappings?.[0];
  const poCode = firstItem?.custom_field3?.trim() || null;

  const data = {
    orderCode: o.sale_order_no,
    amisOrderId: o.id,
    source: "AMIS_API",
    customerName: o.account_name || "(Không rõ khách hàng)",
    customerCode: o.account_code,
    salesEmployeeNameRaw,
    salesEmployeeId,
    orderDate: o.sale_order_date ? new Date(o.sale_order_date) : null,
    expectedDeliveryDate: o.deadline_date ? new Date(o.deadline_date) : null,
    status: o.is_deleted ? OrderStatus.CANCELLED : mapAmisStatus(o.delivery_status, o.status),
    totalValue: o.sale_order_amount ?? o.total_summary ?? 0,
    poCode,
    rawData: o as object,
  };

  const existing = await prisma.order.findFirst({
    where: { OR: [{ amisOrderId: o.id }, { orderCode: o.sale_order_no }] },
    select: { id: true },
  });

  if (existing) {
    await prisma.order.update({ where: { id: existing.id }, data });
  } else {
    await prisma.order.create({ data });
  }
}

/**
 * Đồng bộ đơn hàng từ MISA AMIS CRM Open API. Chỉ lấy đơn có modified_date mới hơn lần
 * đồng bộ thành công gần nhất (incremental) — lần đầu chạy giới hạn 180 ngày gần nhất để
 * tránh kéo toàn bộ lịch sử.
 */
export async function runAmisOrderSync(triggeredBy: string): Promise<SyncOutcome> {
  const syncLog = await prisma.syncLog.create({
    data: { jobType: "AMIS_ORDER_SYNC", status: "RUNNING", triggeredBy },
  });

  try {
    const appId = process.env.AMIS_APP_ID;
    const clientSecret = process.env.AMIS_CLIENT_SECRET;
    if (!appId || !clientSecret) {
      throw new Error("Thiếu AMIS_APP_ID/AMIS_CLIENT_SECRET trong biến môi trường của worker");
    }

    const token = await getAmisToken(appId, clientSecret);

    const lastSuccess = await prisma.syncLog.findFirst({
      where: { jobType: "AMIS_ORDER_SYNC", status: "SUCCESS", cursor: { not: null } },
      orderBy: { startedAt: "desc" },
    });
    const cursorDate = lastSuccess?.cursor ? new Date(lastSuccess.cursor) : null;
    const safetyWindowStart = new Date();
    safetyWindowStart.setDate(safetyWindowStart.getDate() - 180);
    const cutoff = cursorDate ?? safetyWindowStart;

    const pageSize = 100;
    let page = 0;
    let processed = 0;
    let newestModified: Date | null = null;
    const unmatchedEmployeeCodes = new Set<string>();

    while (page < 200) {
      // giới hạn an toàn 200 trang (~20.000 đơn) đề phòng lỗi logic cursor gây lặp vô hạn
      const orders = await fetchSaleOrdersPage(token, appId, page, pageSize);
      if (orders.length === 0) break;

      let reachedCutoff = false;
      for (const o of orders) {
        const modifiedDate = new Date(o.modified_date);
        if (modifiedDate <= cutoff) {
          reachedCutoff = true;
          break; // API sort theo modified_date giảm dần, gặp bản ghi cũ hơn cutoff là dừng
        }
        if (!newestModified || modifiedDate > newestModified) newestModified = modifiedDate;
        await upsertOrderFromAmis(o, unmatchedEmployeeCodes);
        processed++;
      }
      if (reachedCutoff || orders.length < pageSize) break;
      page++;
    }

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        recordsSynced: processed,
        cursor: (newestModified ?? cursorDate ?? new Date(0)).toISOString(),
        message:
          unmatchedEmployeeCodes.size > 0
            ? `NV chưa khớp (điền mã AMIS ở trang Nhân viên): ${[...unmatchedEmployeeCodes].join(", ")}`
            : undefined,
      },
    });

    logger.info(`Đồng bộ đơn hàng AMIS thành công: ${processed} đơn`);
    return { status: "SUCCESS", recordsSynced: processed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    logger.error("Đồng bộ đơn hàng AMIS thất bại:", message);
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: "FAILED", finishedAt: new Date(), message },
    });
    return { status: "FAILED", recordsSynced: 0, message };
  }
}
