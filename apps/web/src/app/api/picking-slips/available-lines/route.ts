import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { getAvailablePickingLines } from "@/lib/picking-slips";

export const dynamic = "force-dynamic";

/** Toàn bộ dòng PO chưa giao của 1 khách hàng — dùng cho bước 2 tạo Phiếu soạn hàng (tích chọn +
 * điền SL cần soạn/Ngày cần giao). */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const customerCode = req.nextUrl.searchParams.get("customerCode");
    if (!customerCode) return NextResponse.json({ error: "Thiếu customerCode" }, { status: 400 });
    const lines = await getAvailablePickingLines(customerCode);
    return NextResponse.json({ lines });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("picking-slips/available-lines GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách PO chưa giao" }, { status: 500 });
  }
}
