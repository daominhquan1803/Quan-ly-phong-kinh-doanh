import { prisma, normPoStatus, PO_CLOSED_STATUS } from "@hoanggia/db";

/**
 * Phiếu soạn hàng — lấy dòng hàng nguồn từ PoTrackingLine (Tiến độ giao hàng, xem
 * packages/db/src/po-delivery-sync.ts) vì đó là nguồn "SL chưa giao" đáng tin cậy nhất đã có sẵn
 * trong hệ thống (không phải suy đoán lại từ Order). Phiếu soạn hàng CHỈ ĐỌC dữ liệu này, không
 * ghi ngược lại — theo đúng xác nhận với anh Quân, không theo dõi trùng lặp giữa các phiếu.
 */

export interface PickingCustomerOption {
  customerCode: string;
  customerName: string;
}

/** Danh sách khách hàng còn ít nhất 1 dòng PO chưa giao (đang mở, SL chưa giao > 0) — lọc theo
 * tên hoặc mã khách hàng, không phân biệt hoa/thường. */
export async function searchPickingCustomers(query: string): Promise<PickingCustomerOption[]> {
  const lines = await prisma.poTrackingLine.findMany({
    where: { salesEmployeeId: { not: null }, customerCode: { not: null } },
    select: { customerCode: true, statusRaw: true, remainingQty: true },
  });

  const openCodes = new Set<string>();
  for (const l of lines) {
    if (!l.customerCode) continue;
    if (normPoStatus(l.statusRaw) === PO_CLOSED_STATUS) continue;
    if (!(Number(l.remainingQty ?? 0) > 0)) continue;
    openCodes.add(l.customerCode);
  }
  if (openCodes.size === 0) return [];

  // Lấy tên khách hàng đầy đủ qua Order (PoTrackingLine chỉ có mã, không có tên) — dùng đúng tên
  // ghi ở đơn hàng GẦN NHẤT của mã đó cho nhất quán với các trang khác.
  const orders = await prisma.order.findMany({
    where: { customerCode: { in: Array.from(openCodes) } },
    select: { customerCode: true, customerName: true, orderDate: true },
    orderBy: { orderDate: "desc" },
  });
  const nameByCode = new Map<string, string>();
  for (const o of orders) {
    if (o.customerCode && !nameByCode.has(o.customerCode)) nameByCode.set(o.customerCode, o.customerName);
  }

  const options = Array.from(openCodes).map((code) => ({
    customerCode: code,
    customerName: nameByCode.get(code) ?? code,
  }));

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.customerName.toLowerCase().includes(q) || o.customerCode.toLowerCase().includes(q))
    : options;
  return filtered.sort((a, b) => a.customerName.localeCompare(b.customerName, "vi")).slice(0, 30);
}

export interface AvailablePickingLine {
  poTrackingLineId: string;
  salesEmployeeId: string | null;
  salesEmployeeName: string;
  poCode: string;
  itemCode: string | null;
  itemName: string;
  customerItemCode: string | null;
  unit: string | null;
  poQuantity: number | null;
  remainingQty: number | null;
  poDate: string | null;
  requestedDeliveryDate: string | null;
}

/** Toàn bộ dòng PO còn chưa giao (đang mở, SL chưa giao > 0) của 1 khách hàng — sắp theo Ngày PO
 * cũ nhất trước, đúng thứ tự cần soạn trước. */
export async function getAvailablePickingLines(customerCode: string): Promise<AvailablePickingLine[]> {
  const lines = await prisma.poTrackingLine.findMany({
    where: { customerCode, salesEmployeeId: { not: null } },
    select: {
      id: true,
      poCode: true,
      itemCode: true,
      itemName: true,
      customerItemCode: true,
      unit: true,
      poQuantity: true,
      remainingQty: true,
      poDate: true,
      requestedDeliveryDate: true,
      statusRaw: true,
      salesEmployeeId: true,
      salesEmployee: { select: { name: true } },
    },
    orderBy: [{ poDate: "asc" }, { poCode: "asc" }],
  });

  return lines
    .filter((l) => normPoStatus(l.statusRaw) !== PO_CLOSED_STATUS && Number(l.remainingQty ?? 0) > 0)
    .map((l) => ({
      poTrackingLineId: l.id,
      salesEmployeeId: l.salesEmployeeId,
      salesEmployeeName: l.salesEmployee?.name ?? "—",
      poCode: l.poCode,
      itemCode: l.itemCode,
      itemName: l.itemName ?? "",
      customerItemCode: l.customerItemCode,
      unit: l.unit,
      poQuantity: l.poQuantity != null ? Number(l.poQuantity) : null,
      remainingQty: l.remainingQty != null ? Number(l.remainingQty) : null,
      poDate: l.poDate ? l.poDate.toISOString() : null,
      requestedDeliveryDate: l.requestedDeliveryDate ? l.requestedDeliveryDate.toISOString() : null,
    }));
}

/** Sinh Số phiếu tự động dạng "PSH-000001" — thử vài lần nếu đụng trùng (đếm rồi cộng 1, hiếm khi
 * xảy ra vì tính năng dùng nội bộ, không nhiều người tạo cùng lúc). */
export async function generatePickingSlipNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await prisma.pickingSlip.count();
    const candidate = `PSH-${String(count + 1 + attempt).padStart(6, "0")}`;
    const exists = await prisma.pickingSlip.findUnique({ where: { slipNumber: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  // Cực hiếm khi chạy tới đây — dự phòng bằng mốc thời gian để không bao giờ thất bại hẳn.
  return `PSH-${Date.now()}`;
}
