import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { buildCustomerReport } from "@/lib/customer-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Báo cáo Danh sách khách hàng. ADMIN: cả phòng hoặc ?employee=ID; NVKD: chỉ khách của mình. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const isAdmin = session.user.role === "ADMIN";
    const employee = new URL(req.url).searchParams.get("employee") || undefined;
    const employeeId = isAdmin ? employee : session.user.id;
    const report = await buildCustomerReport({ employeeId });
    return NextResponse.json({
      scope: isAdmin ? "TEAM" : "SELF",
      employeeId: employeeId ?? null,
      report: { ...report, unclassifiedItems: isAdmin ? report.unclassifiedItems : [] },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer-report GET error", err);
    return NextResponse.json({ error: "Không tạo được báo cáo danh sách khách" }, { status: 500 });
  }
}
