import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  buyingPattern: z.enum(["REGULAR", "SEASONAL", "PROJECT"]),
  seasonMonths: z.array(z.number().int().min(1).max(12)).max(12).optional(),
  seasonLeadMonths: z.number().int().min(1).max(6).optional(),
});

/** NVKD tích "mua theo vụ / dự án" cho khách của mình (ADMIN: mọi khách). */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const { buyingPattern, seasonLeadMonths } = parsed.data;
    const seasonMonths = Array.from(new Set(parsed.data.seasonMonths ?? [])).sort((a, b) => a - b);
    if (buyingPattern === "SEASONAL" && seasonMonths.length === 0) {
      return NextResponse.json({ error: "Chọn ít nhất 1 tháng mua theo vụ" }, { status: 400 });
    }
    const target = await prisma.customer.findUnique({ where: { id: params.id }, select: { salesEmployeeId: true } });
    if (!target || (session.user.role !== "ADMIN" && target.salesEmployeeId !== session.user.id)) {
      return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });
    }
    const customer = await prisma.customer.update({
      where: { id: params.id },
      data: {
        buyingPattern,
        seasonMonths: buyingPattern === "SEASONAL" ? seasonMonths : [],
        ...(seasonLeadMonths ? { seasonLeadMonths } : {}),
      },
      select: { id: true, buyingPattern: true, seasonMonths: true, seasonLeadMonths: true },
    });
    return NextResponse.json({ customer });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customers/[id]/pattern PUT error", err);
    return NextResponse.json({ error: "Không lưu được kiểu mua của khách" }, { status: 500 });
  }
}
