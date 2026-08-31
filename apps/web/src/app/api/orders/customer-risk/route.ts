import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getCustomerRiskReport } from "@/lib/customer-risk-query";

export const dynamic = "force-dynamic";

/** Cảnh báo khách hàng có nguy cơ mất (dựa trên nhịp đặt hàng riêng của từng khách). SALES chỉ
 * thấy khách của mình; ADMIN thấy tất cả và lọc được theo từng nhân viên. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");

    // SALES luôn bị ép về chính mình, không cho ghi đè qua query param (cùng quy ước với
    // scopeByOwner ở /api/orders).
    const onlyEmployeeId =
      session.user.role === "ADMIN" ? employeeId || undefined : session.user.id;

    const report = await getCustomerRiskReport({ onlyEmployeeId });
    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("orders/customer-risk GET error", err);
    return NextResponse.json({ error: "Không tải được cảnh báo khách hàng" }, { status: 500 });
  }
}
