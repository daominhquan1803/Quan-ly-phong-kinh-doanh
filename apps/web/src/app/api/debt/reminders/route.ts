import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Lịch sử thư nhắc công nợ đã gửi cho khách. ADMIN thấy tất; NVKD chỉ thấy thư của hoá đơn mình phụ trách. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const milestone = searchParams.get("milestone");

    const invoiceWhere: Prisma.DebtInvoiceWhereInput = { ...scopeByOwner(session, "salesEmployeeId") };
    if (q) {
      invoiceWhere.OR = [
        { customerName: { contains: q, mode: "insensitive" } },
        { customerCode: { contains: q, mode: "insensitive" } },
        { invoiceNumber: { contains: q, mode: "insensitive" } },
      ];
    }
    const where: Prisma.DebtReminderLogWhereInput = { invoice: invoiceWhere };
    if (milestone === "D7" || milestone === "D0" || milestone === "OVERDUE") where.milestone = milestone;

    const logs = await prisma.debtReminderLog.findMany({
      where,
      include: {
        invoice: {
          select: {
            customerCode: true,
            customerName: true,
            invoiceNumber: true,
            dueDate: true,
            salesEmployee: { select: { name: true } },
          },
        },
      },
      orderBy: { sentAt: "desc" },
      // Chặn trên giống /api/debt — bảng lọc/sắp xếp ở client.
      take: 2000,
    });

    // triggeredBy = "CRON" hoặc User.id của người bấm "Gửi ngay" -> đổi sang tên để hiển thị.
    const userIds = Array.from(new Set(logs.map((l) => l.triggeredBy).filter((t) => t !== "CRON")));
    const users = userIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return NextResponse.json({
      logs: logs.map((l) => ({ ...l, triggeredByName: l.triggeredBy === "CRON" ? null : nameById.get(l.triggeredBy) ?? null })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("debt/reminders GET error", err);
    return NextResponse.json({ error: "Không tải được lịch sử thư nhắc công nợ" }, { status: 500 });
  }
}
