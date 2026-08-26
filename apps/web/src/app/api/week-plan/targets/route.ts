import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { setWeekPlanTargets, WEEK_PLAN_METRICS, WEEK_PLAN_WEIGHT_TOTAL } from "@/lib/week-plan";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  weekStart: z.string().min(1),
  targets: z
    .array(
      z.object({
        employeeId: z.string().min(1),
        metric: z.enum(WEEK_PLAN_METRICS as [string, ...string[]]),
        targetValue: z.number().int().min(0).max(1000),
        weight: z.number().int().min(0).max(100),
      })
    )
    .max(200),
});

/**
 * Giao chỉ tiêu tuần + trọng số cho từng nhân viên — CHỈ Quản trị viên, có thể giao trước cho
 * tuần tương lai (không giới hạn weekStart phải >= tuần hiện tại). Ghi đè toàn bộ chỉ tiêu gửi
 * lên trong 1 lần lưu (upsert theo employeeId+weekStart+metric).
 *
 * Chỉ validate tổng trọng số = 100 cho những nhân viên có ĐỦ 6 mục trong lần lưu này (khớp cách
 * UI luôn gửi trọn bộ 6 mục/người mỗi lần lưu) — bỏ qua nếu payload chỉ gửi 1 phần của 1 người.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const weekStart = new Date(parsed.data.weekStart);
    if (Number.isNaN(weekStart.getTime())) {
      return NextResponse.json({ error: "weekStart không hợp lệ" }, { status: 400 });
    }

    const byEmployee = new Map<string, typeof parsed.data.targets>();
    for (const t of parsed.data.targets) {
      if (!byEmployee.has(t.employeeId)) byEmployee.set(t.employeeId, []);
      byEmployee.get(t.employeeId)!.push(t);
    }
    for (const [, items] of byEmployee) {
      if (items.length !== WEEK_PLAN_METRICS.length) continue;
      const weightSum = items.reduce((s, it) => s + it.weight, 0);
      if (weightSum !== WEEK_PLAN_WEIGHT_TOTAL) {
        return NextResponse.json(
          { error: `Tổng trọng số 6 mục phải bằng ${WEEK_PLAN_WEIGHT_TOTAL} — hiện đang là ${weightSum}` },
          { status: 400 }
        );
      }
    }

    await setWeekPlanTargets(
      weekStart,
      session.user.id,
      parsed.data.targets.map((t) => ({
        employeeId: t.employeeId,
        metric: t.metric as (typeof WEEK_PLAN_METRICS)[number],
        targetValue: t.targetValue,
        weight: t.weight,
      }))
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("week-plan targets POST error", err);
    return NextResponse.json({ error: "Không lưu được chỉ tiêu tuần" }, { status: 500 });
  }
}
