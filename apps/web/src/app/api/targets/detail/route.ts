import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getTargetBreakdown } from "@/lib/target-breakdown";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  employeeId: z.string().trim().min(1).max(60),
  metric: z.enum(["delivered", "oih"]),
  group: z.enum(["all", "Sản xuất", "Thương mại"]).default("all"),
});

/**
 * GET /api/targets/detail — chi tiết theo khách của "Thực hiện (đã giao)" / OIH của 1 nhân viên trong tháng (trang Kế hoạch kinh doanh).
 * NVKD chỉ xem được của chính mình; ADMIN xem được của mọi nhân viên.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Tham số không hợp lệ" }, { status: 400 });
    const q = parsed.data;
    const employeeId = session.user.role === "ADMIN" ? q.employeeId : session.user.id;
    const result = await getTargetBreakdown({ year: q.year, month: q.month, employeeId, metric: q.metric, group: q.group });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("targets/detail GET error", err);
    return NextResponse.json({ error: "Không tải được chi tiết theo khách" }, { status: 500 });
  }
}
