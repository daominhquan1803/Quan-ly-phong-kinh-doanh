import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireSystemAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { getOwnedCustomers } from "@/lib/customer-care-transfer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Khách đang đứng tên người đăng nhập (anh Quân) + danh sách NVKD có thể nhận. Chỉ quản trị hệ thống. */
export async function GET() {
  try {
    const session = await requireSystemAdmin();
    const [rows, employees] = await Promise.all([
      getOwnedCustomers(session.user.id),
      prisma.user.findMany({ where: { active: true, role: "SALES" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({ rows, employees });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customer-care/transfer GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách khách" }, { status: 500 });
  }
}

const schema = z.object({
  employeeId: z.string().min(1, "Chọn NVKD nhận"),
  customerIds: z.array(z.string().min(1)).min(1, "Chưa chọn khách nào").max(1000),
  /** chuyển cả công nợ còn đứng tên người chuyển của các khách này sang người nhận (mặc định không) */
  moveDebt: z.boolean().optional(),
});

/** Chuyển khách đang đứng tên mình cho NVKD — chỉ khách của chính người chuyển (không đụng khách của NVKD khác). */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSystemAdmin();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const { employeeId, customerIds, moveDebt } = parsed.data;
    const me = session.user.id;
    if (employeeId === me) return NextResponse.json({ error: "Chọn NVKD khác để chuyển" }, { status: 400 });
    const emp = await prisma.user.findFirst({ where: { id: employeeId, active: true, role: "SALES" }, select: { id: true, name: true } });
    if (!emp) return NextResponse.json({ error: "Người nhận không hợp lệ" }, { status: 400 });

    const targets = await prisma.customer.findMany({ where: { id: { in: customerIds }, salesEmployeeId: me }, select: { id: true, customerCode: true } });
    if (targets.length === 0) return NextResponse.json({ error: "Không có khách nào đang đứng tên bạn trong danh sách chọn" }, { status: 400 });
    const res = await prisma.customer.updateMany({ where: { id: { in: targets.map((t) => t.id) }, salesEmployeeId: me }, data: { salesEmployeeId: emp.id } });
    let debtMoved = 0;
    if (moveDebt) {
      const d = await prisma.debtInvoice.updateMany({ where: { customerCode: { in: targets.map((t) => t.customerCode) }, salesEmployeeId: me }, data: { salesEmployeeId: emp.id } });
      debtMoved = d.count;
    }
    await prisma.notification.create({
      data: {
        userId: emp.id,
        type: "CARE_DUE_DAILY",
        title: `Anh Quân chuyển ${res.count} khách cho bạn phụ trách`,
        message: `${res.count} khách vào lịch chăm sóc của bạn: ${targets.slice(0, 8).map((t) => t.customerCode).join(", ")}${targets.length > 8 ? "..." : ""}. Hãy xem danh sách "Hôm nay cần chạm" và liên hệ khách.`,
        link: `/cham-soc?transferred=${Date.now()}`,
      },
    });
    return NextResponse.json({ transferred: res.count, skipped: customerIds.length - targets.length, debtMoved });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customer-care/transfer POST error", err);
    return NextResponse.json({ error: "Không chuyển được khách" }, { status: 500 });
  }
}
