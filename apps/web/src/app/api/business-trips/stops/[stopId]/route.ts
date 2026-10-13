import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { z } from "zod";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({ done: z.boolean() });

/** Đánh dấu bước tiếp theo của 1 khách đã xong / chưa xong — người phụ trách, chủ buổi đi hoặc Quản trị viên. */
export async function PATCH(req: NextRequest, { params }: { params: { stopId: string } }) {
  try {
    const session = await requireSession();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    const stop = await prisma.businessTripStop.findUnique({
      where: { id: params.stopId },
      select: { nextAction: true, nextActionOwnerId: true, trip: { select: { employeeId: true } } },
    });
    if (!stop || !stop.nextAction) {
      return NextResponse.json({ error: "Không có bước tiếp theo để cập nhật" }, { status: 404 });
    }
    const allowed =
      session.user.role === "ADMIN" ||
      stop.nextActionOwnerId === session.user.id ||
      stop.trip.employeeId === session.user.id;
    if (!allowed) return NextResponse.json({ error: "Không có quyền cập nhật việc này" }, { status: 403 });
    await prisma.businessTripStop.update({
      where: { id: params.stopId },
      data: { nextActionDoneAt: parsed.data.done ? new Date() : null },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips stop PATCH error", err);
    return NextResponse.json({ error: "Không cập nhật được" }, { status: 500 });
  }
}
