import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireAdmin, requireSystemAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { lastWeekRangeVN, pickWeekly } from "@/lib/customer-care-plan";

export const dynamic = "force-dynamic";

const PER_EMPLOYEE = 3;
const DAY = 86_400_000;

/** Kiểm tra chéo: mỗi tuần chọn ngẫu nhiên (cố định theo tuần) 3 lần ghi chăm sóc của mỗi NVKD trong tuần trước để trưởng phòng gọi xác minh. */
export async function GET() {
  try {
    await requireAdmin();
    const range = lastWeekRangeVN();
    const weekKey = new Date(range.from + 7 * 3600_000).toISOString().slice(0, 10);
    const logs = await prisma.customerCareLog.findMany({
      where: { createdAt: { gte: new Date(range.from), lt: new Date(range.to + DAY) }, outcome: { not: "NO_CONTACT" }, employee: { role: "SALES" } },
      select: {
        id: true,
        employeeId: true,
        channel: true,
        outcome: true,
        note: true,
        createdAt: true,
        photos: { select: { id: true } },
        employee: { select: { name: true } },
        customer: { select: { id: true, customerCode: true, customerName: true, contactPerson: true } },
        spotCheck: { select: { result: true, note: true, createdAt: true, checkedBy: { select: { name: true } } } },
      },
    });
    const byEmp = new Map<string, typeof logs>();
    for (const l of logs) (byEmp.get(l.employeeId) ?? byEmp.set(l.employeeId, []).get(l.employeeId)!).push(l);
    const samples = [...byEmp.values()].flatMap((rows) => pickWeekly(rows, weekKey, PER_EMPLOYEE));
    return NextResponse.json({ range, samples });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customer-care/spot-checks GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách kiểm tra chéo" }, { status: 500 });
  }
}

const schema = z.object({
  logId: z.string().min(1),
  result: z.enum(["OK", "FAKE"]),
  note: z.string().trim().max(500).optional().nullable(),
});

/** Trưởng phòng ghi kết quả xác minh — FAKE (ghi khống) trừ điểm KPI tháng của NVKD. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSystemAdmin();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    const { logId, result, note } = parsed.data;
    if (result === "FAKE" && !note) return NextResponse.json({ error: "Ghi rõ vì sao xác định là ghi khống" }, { status: 400 });
    const log = await prisma.customerCareLog.findUnique({ where: { id: logId }, select: { id: true } });
    if (!log) return NextResponse.json({ error: "Không tìm thấy lần ghi" }, { status: 404 });
    const data = { result, note: note || null, checkedById: session.user.id };
    const check = await prisma.careSpotCheck.upsert({ where: { logId }, create: { logId, ...data }, update: data });
    return NextResponse.json({ check });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customer-care/spot-checks POST error", err);
    return NextResponse.json({ error: "Không lưu được" }, { status: 500 });
  }
}
