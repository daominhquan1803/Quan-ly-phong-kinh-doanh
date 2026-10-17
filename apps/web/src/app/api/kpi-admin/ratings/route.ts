import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const thisMonth = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);

/** NVKD xem Admin kinh doanh cần chấm + điểm mình đã chấm trong tháng (?month=YYYY-MM). */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const month = new URL(req.url).searchParams.get("month") ?? thisMonth();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: "Tháng không hợp lệ" }, { status: 400 });
    const [year, m] = month.split("-").map(Number);
    const admins = await prisma.user.findMany({ where: { role: "ADMIN", accessLevel: "OPERATOR", active: true }, select: { id: true, name: true } });
    const mine = await prisma.adminSatisfactionRating.findMany({ where: { raterId: session.user.id, year, month: m }, select: { adminId: true, score: true, comment: true } });
    return NextResponse.json({ admins, mine, canRate: session.user.role === "SALES" });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("kpi-admin ratings GET error", err);
    return NextResponse.json({ error: "Không tải được" }, { status: 500 });
  }
}

const schema = z.object({
  adminId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  score: z.number().int().min(1, "Chấm từ 1 đến 5").max(5, "Chấm từ 1 đến 5"),
  comment: z.string().trim().max(1000).optional().nullable(),
});

/** NVKD chấm mức hài lòng (1–5) về hỗ trợ của Admin kinh doanh trong tháng — chấm lại thì ghi đè. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role !== "SALES") throw new ForbiddenError("Chỉ nhân viên kinh doanh chấm mức hài lòng");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const { adminId, score, comment } = parsed.data;
    const [year, month] = parsed.data.month.split("-").map(Number);
    const admin = await prisma.user.findFirst({ where: { id: adminId, role: "ADMIN", accessLevel: "OPERATOR" }, select: { id: true } });
    if (!admin) return NextResponse.json({ error: "Không phải Admin kinh doanh" }, { status: 400 });
    const rating = await prisma.adminSatisfactionRating.upsert({
      where: { adminId_raterId_year_month: { adminId, raterId: session.user.id, year, month } },
      create: { adminId, raterId: session.user.id, year, month, score, comment: comment || null },
      update: { score, comment: comment || null },
    });
    return NextResponse.json({ rating }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("kpi-admin ratings POST error", err);
    return NextResponse.json({ error: "Không lưu được" }, { status: 500 });
  }
}
