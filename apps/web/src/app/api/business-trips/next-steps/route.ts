import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** "Việc tiếp theo" sau các buổi gặp: bước tiếp theo chưa xong của báo cáo đã nộp/duyệt. SALES thấy việc của mình, ADMIN thấy tất cả (lọc được theo employeeId). */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const isAdmin = session.user.role === "ADMIN";
    const employeeId = new URL(req.url).searchParams.get("employeeId");
    const ownerFilter = isAdmin
      ? employeeId
        ? { nextActionOwnerId: employeeId }
        : {}
      : { nextActionOwnerId: session.user.id };

    const stops = await prisma.businessTripStop.findMany({
      where: {
        nextAction: { not: null },
        nextActionDoneAt: null,
        outcome: { in: ["MET", "RESCHEDULED"] },
        trip: { status: { in: ["REPORTED", "APPROVED"] } },
        ...ownerFilter,
      },
      select: {
        id: true,
        companyName: true,
        address: true,
        contactName: true,
        contactPhone: true,
        nextAction: true,
        nextActionDue: true,
        nextActionOwner: { select: { id: true, name: true } },
        trip: { select: { visitDate: true, employee: { select: { name: true } } } },
      },
      orderBy: [{ nextActionDue: "asc" }],
      take: 300,
    });
    return NextResponse.json({ steps: stops });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips next-steps GET error", err);
    return NextResponse.json({ error: "Không tải được việc tiếp theo" }, { status: 500 });
  }
}
