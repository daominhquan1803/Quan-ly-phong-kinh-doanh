import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { searchPickingCustomers } from "@/lib/picking-slips";

export const dynamic = "force-dynamic";

/** Tìm khách hàng còn dòng PO chưa giao — theo tên hoặc mã, dùng cho bước 1 tạo Phiếu soạn hàng. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const customers = await searchPickingCustomers(q);
    return NextResponse.json({ customers });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("picking-slips/customers GET error", err);
    return NextResponse.json({ error: "Không tìm được khách hàng" }, { status: 500 });
  }
}
