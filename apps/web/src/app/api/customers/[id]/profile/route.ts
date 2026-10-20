import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { profileSchema } from "@/lib/customer-profile";
import { buildCustomerReport } from "@/lib/customer-report";

export const dynamic = "force-dynamic";

/** Hồ sơ 1 khách kèm phần tự tính (địa chỉ AMIS, nhóm hàng đang mua, tiến trình gợi ý, % hồ sơ) — cho khung Hồ sơ khách. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const target = await prisma.customer.findUnique({ where: { id: params.id }, select: { salesEmployeeId: true } });
    if (!target || (session.user.role !== "ADMIN" && target.salesEmployeeId !== session.user.id)) {
      return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });
    }
    const report = await buildCustomerReport({ customerId: params.id });
    return NextResponse.json({ row: report.rows[0] ?? null });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer profile GET error", err);
    return NextResponse.json({ error: "Không tải được hồ sơ khách" }, { status: 500 });
  }
}

/** NVKD (khách của mình) / quản trị cập nhật hồ sơ khách trên app. Đổi tiến trình thì lưu lịch sử. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const parsed = profileSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const target = await prisma.customer.findUnique({ where: { id: params.id }, select: { salesEmployeeId: true, stage: true } });
    if (!target || (session.user.role !== "ADMIN" && target.salesEmployeeId !== session.user.id)) {
      return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });
    }
    const p = parsed.data;
    const now = new Date();
    const data: Record<string, unknown> = { profileUpdatedAt: now };
    for (const [k, v] of Object.entries(p)) if (v !== undefined) data[k] = typeof v === "string" ? v.trim() || null : v;
    const stageChanged = p.stage !== undefined && p.stage !== target.stage;
    if (stageChanged) data.stageUpdatedAt = now;
    await prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: params.id }, data });
      if (stageChanged && p.stage) {
        await tx.customerStageHistory.create({ data: { customerId: params.id, fromStage: target.stage, toStage: p.stage, changedById: session.user.id, source: "APP" } });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer profile PATCH error", err);
    return NextResponse.json({ error: "Không lưu được hồ sơ khách" }, { status: 500 });
  }
}
