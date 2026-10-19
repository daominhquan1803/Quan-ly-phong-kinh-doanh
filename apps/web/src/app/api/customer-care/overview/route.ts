import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getCareOverview } from "@/lib/customer-care-query";

export const dynamic = "force-dynamic";

/** Danh sách khách kèm lần chăm sóc cuối, hẹn lại, trạng thái vụ. SALES chỉ thấy khách của mình. */
export async function GET() {
  try {
    const session = await requireSession();
    const customers = await getCareOverview({
      onlyEmployeeId: session.user.role === "ADMIN" ? undefined : session.user.id,
    });
    return NextResponse.json({ customers });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer-care/overview GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách chăm sóc" }, { status: 500 });
  }
}
