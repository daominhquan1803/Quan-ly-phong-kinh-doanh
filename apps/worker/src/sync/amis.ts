import {
  prisma,
  OrderStatus,
  resolveEmployeeIdByCode,
  resolveEmployeeIdByName,
  extractNameFromAmisLabel,
  getManagedAmisEmployeeCodes,
  normalizeVN,
} from "@hoanggia/db";
import { logger } from "../logger";

const AMIS_BASE_URL = process.env.AMIS_BASE_URL || "https://crmconnect.misa.vn";

export interface SyncOutcome {
  status: "SUCCESS" | "FAILED";
  recordsSynced: number;
  message?: string;
}

interface AmisProductMapping {
  product_code?: string | null;
  description?: string | null;
  unit?: string | null;
  amount?: number | null; // số lượng
  price?: number | null; // đơn giá
  total?: number | null; // thành tiền
  stock_name?: string | null; // kho
  custom_field3?: string | null; // "Số PO/Mã hàng KH" theo mẫu phiếu Hoàng Gia
}

interface AmisSaleOrder {
  id: number;
  sale_order_no: string;
  account_name: string | null;
  account_code: string | null;
  sale_order_date: string | null;
  deadline_date: string | null;
  // Ngày giao hàng thực tế AMIS ghi nhận — khác với deadline_date (hạn giao dự kiến).
  delivery_date: string | null;
  status: string | null;
  delivery_status: string | null;
  revenue_status: string | null; // "Tình trạng ghi doanh số": Bản nháp | Đề nghị ghi | Đã ghi | Huỷ ghi
  sale_order_amount: number | null;
  total_summary: number | null;
  // Giá trị hàng đã giao cộng dồn — dùng để tính "còn lại chưa giao" cho đơn giao 1 phần.
  total_amount_delivered_summary: number | null;
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
 * Đơn ở trạng thái "Bản nháp" (chưa chốt), "Huỷ ghi" hoặc "Từ chối ghi" (không được ghi
 * nhận doanh số) trên cột "Tình trạng ghi doanh số" của AMIS — theo yêu cầu, các đơn này
 * không được coi là đơn hàng thật nên không đưa vào hệ thống. Dữ liệu thật quan sát được
 * gồm 5 giá trị: Bản nháp, Đề nghị ghi, Đã ghi, Từ chối ghi, và rỗng (coi là hợp lệ, không
 * loại trừ khi thiếu dữ liệu).
 */
function isExcludedRevenueStatus(revenueStatus: string | null): boolean {
  if (!revenueStatus) return false;
  const norm = normalizeVN(revenueStatus);
  return norm.includes("nhap") || norm.includes("huy") || norm.includes("tu choi");
}

/**
 * Theo yêu cầu: hệ thống AMIS không cập nhật đúng thông tin giao hàng cho các đơn đặt
 * trước tháng 4/2026, nên các đơn này không được đưa vào hệ thống (số liệu tiến độ giao
 * hàng sẽ sai). Đơn không có sale_order_date thì không loại trừ theo mốc này.
 */
const ORDER_DATE_CUTOFF = new Date("2026-04-01T00:00:00.000Z");

function isBeforeOrderDateCutoff(saleOrderDate: string | null): boolean {
  if (!saleOrderDate) return false;
  const d = new Date(saleOrderDate);
  return !Number.isNaN(d.getTime()) && d < ORDER_DATE_CUTOFF;
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

/** Ghi đè toàn bộ bảng hàng hoá của 1 đơn — khớp với cách AMIS xử lý khi sửa đơn hàng. */
async function syncOrderItems(orderId: string, mappings: AmisProductMapping[] | null) {
  await prisma.orderItem.deleteMany({ where: { orderId } });
  if (!mappings?.length) return;

  await prisma.orderItem.createMany({
    data: mappings.map((m, i) => ({
      orderId,
      lineOrder: i,
      itemCode: m.product_code || null,
      itemName: m.description || m.product_code || "(Không rõ tên hàng)",
      unit: m.unit || null,
      quantity: m.amount ?? 0,
      unitPrice: m.price ?? 0,
      totalPrice: m.total ?? 0,
      warehouse: m.stock_name || null,
      poCustomerItemCode: m.custom_field3?.trim() || null,
    })),
  });
}

/**
 * Đồng bộ 1 đơn hàng nếu người phụ trách nằm trong danh sách nhân viên đang quản lý
 * (managedCodes), không ở trạng thái ghi doanh số Bản nháp/Huỷ ghi, và ngày đặt hàng
 * không trước mốc ORDER_DATE_CUTOFF — bỏ qua đơn của nhân viên/phòng ban khác, và xoá
 * khỏi hệ thống nếu đơn đã đồng bộ trước đó nhưng nay không còn thoả các điều kiện trên.
 * Trả về true nếu đơn được đồng bộ (nằm trong phạm vi quản lý), false nếu bỏ qua.
 */
async function upsertOrderFromAmis(o: AmisSaleOrder, managedCodes: Set<string>): Promise<boolean> {
  const existing = await prisma.order.findFirst({
    where: { OR: [{ amisOrderId: o.id }, { orderCode: o.sale_order_no }] },
    select: { id: true },
  });

  if (isExcludedRevenueStatus(o.revenue_status) || isBeforeOrderDateCutoff(o.sale_order_date)) {
    if (existing) await prisma.order.delete({ where: { id: existing.id } }); // cascade xoá luôn OrderItem
    return false;
  }

  const rawNameLabel = o.recorded_sale_users_name || o.owner_name || null;
  const salesEmployeeNameRaw = rawNameLabel ? extractNameFromAmisLabel(rawNameLabel) : null;

  let salesEmployeeId: string | null = null;
  if (o.employee_code && managedCodes.has(o.employee_code)) {
    salesEmployeeId = await resolveEmployeeIdByCode(o.employee_code);
  } else if (!o.employee_code && salesEmployeeNameRaw) {
    // Một số đơn AMIS không điền employee_code — thử khớp theo tên trong đội đang quản lý.
    salesEmployeeId = await resolveEmployeeIdByName(salesEmployeeNameRaw);
  }

  if (!salesEmployeeId) return false; // ngoài phạm vi quản lý (nhân viên/phòng ban khác) — bỏ qua

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
    actualDeliveryDate: o.delivery_date ? new Date(o.delivery_date) : null,
    status: o.is_deleted ? OrderStatus.CANCELLED : mapAmisStatus(o.delivery_status, o.status),
    totalValue: o.sale_order_amount ?? o.total_summary ?? 0,
    deliveredValue: o.total_amount_delivered_summary ?? 0,
    poCode,
    rawData: o as object,
  };

  const order = existing
    ? await prisma.order.update({ where: { id: existing.id }, data })
    : await prisma.order.create({ data });

  await syncOrderItems(order.id, o.sale_order_product_mappings);
  return true;
}

/**
 * Đồng bộ đơn hàng từ MISA AMIS CRM Open API — CHỈ lấy đơn của nhân viên đang được quản
 * lý trong hệ thống (active, đã gán mã AMIS tại trang Nhân viên), bỏ qua đơn của phòng
 * ban/nhân viên khác trong cùng công ty, và bỏ qua đơn đặt trước 01/04/2026 (xem
 * ORDER_DATE_CUTOFF). Chỉ lấy đơn có modified_date mới hơn lần đồng bộ thành công gần
 * nhất (incremental) — lần đầu chạy giới hạn 180 ngày gần nhất.
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

    const managedCodes = await getManagedAmisEmployeeCodes();
    if (managedCodes.size === 0) {
      throw new Error(
        "Chưa có nhân viên nào được gán mã AMIS — vào trang Nhân viên điền mã AMIS trước khi đồng bộ"
      );
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
    let scanned = 0;
    let newestModified: Date | null = null;

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
        scanned++;
        const synced = await upsertOrderFromAmis(o, managedCodes);
        if (synced) processed++;
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
        message: `Đã quét ${scanned} đơn trên AMIS, đồng bộ ${processed} đơn thuộc phạm vi quản lý`,
      },
    });

    logger.info(`Đồng bộ đơn hàng AMIS thành công: ${processed}/${scanned} đơn thuộc phạm vi quản lý`);
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
