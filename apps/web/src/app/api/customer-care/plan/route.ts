import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { loadCarePlan, evaluateCare, monthRangeVN, lastWeekRangeVN, TIER_CYCLE } from "@/lib/customer-care-plan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lịch chăm sóc theo hạng khách.
 * - mặc định: danh sách khách trong lịch (hạng, chu kỳ, lần chạm cuối, quá hạn) — NVKD chỉ khách của mình.
 * - ?eval=month&month=YYYY-MM | ?eval=week: đánh giá chăm sóc từng NVKD trong kỳ (điểm CSKH /10).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const params = new URL(req.url).searchParams;
    const onlyEmployeeId = session.user.role === "ADMIN" ? undefined : session.user.id;
    const plan = await loadCarePlan({ onlyEmployeeId });
    const scope = onlyEmployeeId ? "SELF" : "TEAM";

    const ev = params.get("eval");
    if (ev) {
      let range;
      if (ev === "week") range = lastWeekRangeVN();
      else {
        const m = params.get("month") ?? new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return NextResponse.json({ error: "Tháng không hợp lệ" }, { status: 400 });
        const [y, mo] = m.split("-").map(Number);
        range = monthRangeVN(y, mo);
      }
      const evaluations = await evaluateCare(range, { onlyEmployeeId }, new Date(), plan);
      return NextResponse.json({ scope, range, evaluations });
    }

    return NextResponse.json({
      scope,
      cycles: TIER_CYCLE,
      employees: plan.employees,
      customers: plan.customers.map((c) => ({
        id: c.id,
        customerCode: c.customerCode,
        customerName: c.customerName,
        employeeId: c.employeeId,
        tier: c.tier,
        cycle: c.cycle,
        value12: c.value12,
        lastOrderAt: c.lastOrderAt ? new Date(c.lastOrderAt).toISOString() : null,
        lastTouch: c.lastTouch ? { at: new Date(c.lastTouch.at).toISOString(), kind: c.lastTouch.kind } : null,
        overdueDays: c.overdueDays,
      })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer-care/plan GET error", err);
    return NextResponse.json({ error: "Không tải được lịch chăm sóc" }, { status: 500 });
  }
}
