import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { DELAY_CATEGORIES } from "@/lib/admin-kpi";

export const dynamic = "force-dynamic";

const schema = z.object({
  lineId: z.string().min(1),
  category: z.enum(Object.keys(DELAY_CATEGORIES) as [string, ...string[]], { errorMap: () => ({ message: "Chọn lý do giao trễ" }) }),
  note: z.string().trim().max(1000).optional().nullable(),
});

/** Admin nhập (hoặc sửa) lý do giao trễ cho 1 dòng PO — sửa lại thì về trạng thái chờ duyệt. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const { lineId, category, note } = parsed.data;
    const line = await prisma.poTrackingLine.findUnique({ where: { id: lineId }, select: { id: true } });
    if (!line) return NextResponse.json({ error: "Không tìm thấy dòng PO" }, { status: 404 });
    const data = { category, note: note || null, status: "PENDING" as const, reviewedById: null, reviewedAt: null, reviewNote: null };
    const reason = await prisma.deliveryDelayReason.upsert({
      where: { lineId },
      create: { lineId, ...data, createdById: session.user.id },
      update: data,
    });
    return NextResponse.json({ reason }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("kpi-admin delay-reasons POST error", err);
    return NextResponse.json({ error: "Không lưu được lý do" }, { status: 500 });
  }
}
