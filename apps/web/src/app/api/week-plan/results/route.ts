import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { isManualMetric, MANUAL_METRICS, snapToWeekStart, weekRange } from "@/lib/week-plan";

export const dynamic = "force-dynamic";

/**
 * Danh sách các dòng khách hàng đã ghi cho 1 trong 3 mục nhập tay của 1 tuần. SALES chỉ xem được
 * dòng của chính mình; ADMIN xem được của bất kỳ ai (truyền employeeId).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const weekStartParam = searchParams.get("weekStart");
    const metric = searchParams.get("metric");
    const employeeIdParam = searchParams.get("employeeId");
    if (!weekStartParam) return NextResponse.json({ error: "Thiếu weekStart" }, { status: 400 });

    const weekStart = snapToWeekStart(new Date(weekStartParam));
    if (Number.isNaN(weekStart.getTime())) {
      return NextResponse.json({ error: "weekStart không hợp lệ" }, { status: 400 });
    }

    const employeeId = session.user.role === "ADMIN" ? employeeIdParam ?? session.user.id : session.user.id;

    const entries = await prisma.weekPlanResultEntry.findMany({
      where: {
        weekStart,
        employeeId,
        ...(metric ? { metric: metric as (typeof MANUAL_METRICS)[number] } : {}),
      },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
      take: 500,
    });

    return NextResponse.json({ entries });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("week-plan results GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách kết quả" }, { status: 500 });
  }
}

const createSchema = z.object({
  weekStart: z.string().min(1),
  metric: z.enum(MANUAL_METRICS as [string, ...string[]]),
  entryDate: z.string().min(1),
  customerName: z.string().trim().min(1, "Thiếu tên khách hàng"),
  address: z.string().trim().max(500).optional().nullable(),
  content: z.string().trim().max(1000).optional().nullable(),
  productInterest: z.string().trim().max(500).optional().nullable(),
  // ADMIN có thể ghi hộ cho người khác — SALES chỉ ghi cho chính mình (bỏ qua nếu có gửi lên).
  employeeId: z.string().trim().min(1).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const employeeId =
      session.user.role === "ADMIN" && parsed.data.employeeId ? parsed.data.employeeId : session.user.id;

    const weekStart = snapToWeekStart(new Date(parsed.data.weekStart));
    const entryDate = new Date(parsed.data.entryDate);
    if (Number.isNaN(weekStart.getTime()) || Number.isNaN(entryDate.getTime())) {
      return NextResponse.json({ error: "Ngày không hợp lệ" }, { status: 400 });
    }
    const { start, end } = weekRange(weekStart);
    if (entryDate < start || entryDate >= end) {
      return NextResponse.json({ error: "Ngày ghi nhận phải nằm trong tuần đang chọn" }, { status: 400 });
    }
    if (!isManualMetric(parsed.data.metric as never)) {
      return NextResponse.json({ error: "Mục này được tính tự động, không nhập tay" }, { status: 400 });
    }

    const entry = await prisma.weekPlanResultEntry.create({
      data: {
        employeeId,
        weekStart,
        metric: parsed.data.metric as never,
        entryDate,
        customerName: parsed.data.customerName.trim(),
        address: parsed.data.address?.trim() || null,
        content: parsed.data.content?.trim() || null,
        productInterest: parsed.data.productInterest?.trim() || null,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("week-plan results POST error", err);
    return NextResponse.json({ error: "Không lưu được kết quả" }, { status: 500 });
  }
}
