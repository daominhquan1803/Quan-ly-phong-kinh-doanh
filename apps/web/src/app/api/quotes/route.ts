import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma, QuoteStatus } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Báo giá là số liệu tổng của cả phòng, không gắn theo từng tài khoản đăng nhập (cột "Phụ
// trách" trong file nguồn không khớp tin cậy được với User) — chỉ ADMIN xem được, cùng lý do với
// Công nợ (xem middleware.ts).
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year"));
    const month = Number(searchParams.get("month"));
    const status = searchParams.get("status");
    const assignee = searchParams.get("assignee");
    const q = searchParams.get("q")?.trim();

    const where: Prisma.QuoteRequestWhereInput = {};
    if (year) where.year = year;
    if (month) where.month = month;
    if (status && Object.values(QuoteStatus).includes(status as QuoteStatus)) where.status = status as QuoteStatus;
    if (assignee) where.assigneeRaw = assignee;
    if (q) {
      where.OR = [
        { customerName: { contains: q, mode: "insensitive" } },
        { productInterest: { contains: q, mode: "insensitive" } },
        { assigneeRaw: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.quoteRequest.findMany({
      where,
      orderBy: [{ requestDay: "desc" }, { createdAt: "desc" }],
      take: 2000,
    });

    return NextResponse.json({ rows });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("quotes GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách báo giá" }, { status: 500 });
  }
}
