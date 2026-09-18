import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const customers = await prisma.customer.findMany({ orderBy: { customerName: "asc" } });
    return NextResponse.json({ customers });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customers GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách khách hàng" }, { status: 500 });
  }
}

const createSchema = z.object({
  customerCode: z.string().trim().min(1, "Thiếu mã khách hàng"),
  customerName: z.string().trim().min(1, "Thiếu tên khách hàng"),
  contactPerson: z.string().trim().max(255).optional().nullable(),
  paymentTermType: z.enum(["DAYS_FROM_INVOICE", "END_OF_MONTH_OFFSET"]).optional().nullable(),
  paymentTermDays: z.number().int().min(0).optional().nullable(),
  paymentTermMonthOffset: z.number().int().min(0).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const { customerCode, customerName, contactPerson, paymentTermType, paymentTermDays, paymentTermMonthOffset } = parsed.data;

    const existing = await prisma.customer.findUnique({ where: { customerCode } });
    if (existing) return NextResponse.json({ error: "Mã khách hàng đã tồn tại" }, { status: 409 });

    const customer = await prisma.customer.create({
      data: {
        customerCode,
        customerName,
        contactPerson: contactPerson || null,
        paymentTermType: paymentTermType || null,
        paymentTermDays: paymentTermType === "DAYS_FROM_INVOICE" ? paymentTermDays ?? null : null,
        paymentTermMonthOffset: paymentTermType === "END_OF_MONTH_OFFSET" ? paymentTermMonthOffset ?? null : null,
      },
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customers POST error", err);
    return NextResponse.json({ error: "Không tạo được khách hàng" }, { status: 500 });
  }
}
