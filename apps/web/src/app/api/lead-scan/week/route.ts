import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireSystemAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { getLeadWeek, setLeadTargets } from "@/lib/lead-scan-data";

export const dynamic = "force-dynamic";

/** Lead MXH của 1 tuần trong Kế hoạch tuần (chỉ tiêu riêng). NVKD chỉ thấy dòng của mình, ADMIN thấy cả phòng. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const param = new URL(req.url).searchParams.get("weekStart");
    const weekStart = param ? new Date(param) : new Date();
    if (Number.isNaN(weekStart.getTime())) return NextResponse.json({ error: "weekStart không hợp lệ" }, { status: 400 });
    const only = session.user.role === "ADMIN" ? undefined : session.user.id;
    const w = await getLeadWeek(weekStart, only);
    return NextResponse.json({ ...w, weekStart: w.weekStart.toISOString(), isAdmin: session.user.role === "ADMIN" });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("lead-scan week GET error", err);
    return NextResponse.json({ error: "Không tải được Lead MXH theo tuần" }, { status: 500 });
  }
}

const bodySchema = z.object({
  weekStart: z.string().min(1),
  targets: z.array(z.object({ employeeId: z.string().min(1), targetValue: z.number().int().min(0).max(5000) })).max(100),
});

/** Giao chỉ tiêu Lead MXH tuần — CHỈ Quản trị hệ thống (cùng quyền giao chỉ tiêu tuần). */
export async function POST(req: NextRequest) {
  try {
    await requireSystemAdmin();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const weekStart = new Date(parsed.data.weekStart);
    if (Number.isNaN(weekStart.getTime())) return NextResponse.json({ error: "weekStart không hợp lệ" }, { status: 400 });
    await setLeadTargets(weekStart, parsed.data.targets);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("lead-scan week POST error", err);
    return NextResponse.json({ error: "Không lưu được chỉ tiêu Lead MXH" }, { status: 500 });
  }
}
