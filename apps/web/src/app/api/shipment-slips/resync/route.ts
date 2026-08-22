import { NextResponse } from "next/server";
import { resyncAllShipmentSlipDeliveries } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * Nút "Đồng bộ lại giao hàng" ở trang Phiếu đi hàng (chỉ ADMIN) — chạy lại việc khớp TOÀN BỘ
 * phiếu đã có với dữ liệu PO tracking hiện tại. Dùng khi số liệu giao hàng (Tiến độ giao hàng/
 * Tổng quan/Kế hoạch kinh doanh — tất cả đều đọc từ PoDeliveryEvent nên tự động khớp theo,
 * không cần đồng bộ riêng từng trang) chưa phản ánh đúng sau khi upload phiếu, ví dụ dòng PO
 * tương ứng được nhập/sửa SAU khi phiếu đã upload, hoặc phiếu cũ chưa khớp được do thiếu Số PO/
 * SL thực xuất mà nay dữ liệu đã đầy đủ hơn. Xem resyncAllShipmentSlipDeliveries.
 */
export async function POST() {
  try {
    await requireAdmin();
    const result = await resyncAllShipmentSlipDeliveries();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("shipment-slips/resync POST error", err);
    return NextResponse.json({ error: "Không đồng bộ lại được" }, { status: 500 });
  }
}
