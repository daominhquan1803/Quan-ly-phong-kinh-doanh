import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * Bảng thông báo chung đầu trang Đăng ký công tác (mọi người dùng đăng nhập thấy): các chuyến công tác chưa qua ngày đi, chưa bị từ chối/huỷ.
 * Chỉ trả thông tin chung (ngày, người đi, tỉnh, tên khách điểm dừng) — chi tiết báo cáo của chuyến vẫn theo phạm vi quyền như cũ.
 */
export async function GET() {
  try {
    await requireSession();
    // Hôm nay theo giờ VN (0h VN) — chuyến đi hôm nay vẫn hiện.
    const vnNow = new Date(Date.now() + 7 * 3600_000);
    const todayStart = new Date(`${vnNow.toISOString().slice(0, 10)}T00:00:00+07:00`);
    const trips = await prisma.businessTripRequest.findMany({
      where: { visitDate: { gte: todayStart }, status: { not: "REJECTED" } },
      select: {
        id: true,
        visitDate: true,
        status: true,
        provinces: true,
        employee: { select: { id: true, name: true } },
        stops: { orderBy: { orderIndex: "asc" }, select: { companyName: true } },
      },
      orderBy: { visitDate: "asc" },
      take: 50,
    });
    return NextResponse.json({ trips });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips/upcoming GET error", err);
    return NextResponse.json({ error: "Không tải được các chuyến công tác sắp đi" }, { status: 500 });
  }
}
