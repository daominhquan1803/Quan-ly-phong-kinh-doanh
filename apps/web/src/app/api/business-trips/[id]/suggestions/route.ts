import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { buildCustomerReport } from "@/lib/customer-report";
import { suggestCustomers } from "@/lib/trip-suggestions";

export const dynamic = "force-dynamic";

/** Khách gợi ý trong tỉnh của chuyến công tác (mọi người dùng đăng nhập xem được) — quy tắc ở lib/trip-suggestions.ts. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const trip = await prisma.businessTripRequest.findUnique({
      where: { id: params.id },
      select: { employeeId: true, provinces: true, stops: { select: { companyName: true } } },
    });
    if (!trip) return NextResponse.json({ error: "Không tìm thấy chuyến công tác" }, { status: 404 });
    if (trip.provinces.length === 0) return NextResponse.json({ suggestions: [] });
    const report = await buildCustomerReport({});
    const suggestions = suggestCustomers(report.rows, {
      provinces: trip.provinces,
      tripEmployeeId: trip.employeeId,
      excludeNames: trip.stops.map((s) => s.companyName),
    });
    return NextResponse.json({ suggestions });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips/[id]/suggestions GET error", err);
    return NextResponse.json({ error: "Không tải được khách gợi ý" }, { status: 500 });
  }
}
