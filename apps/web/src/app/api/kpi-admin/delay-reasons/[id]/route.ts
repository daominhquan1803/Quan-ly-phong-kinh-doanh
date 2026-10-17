import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireSystemAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["approve", "reject"]), reviewNote: z.string().trim().max(1000).optional().nullable() });

/** Trưởng phòng (quản trị hệ thống) duyệt / không duyệt lý do giao trễ. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSystemAdmin();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    const found = await prisma.deliveryDelayReason.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!found) return NextResponse.json({ error: "Không tìm thấy lý do" }, { status: 404 });
    const reason = await prisma.deliveryDelayReason.update({
      where: { id: params.id },
      data: {
        status: parsed.data.action === "approve" ? "APPROVED" : "REJECTED",
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote || null,
      },
    });
    return NextResponse.json({ reason });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("kpi-admin delay-reasons PATCH error", err);
    return NextResponse.json({ error: "Không duyệt được" }, { status: 500 });
  }
}
