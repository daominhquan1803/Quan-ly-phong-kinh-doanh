import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, requireSession, scopeByOwner, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { emailListField, normalizeEmailList } from "@/lib/debt-reminder";
import { normalizeCustomerCode } from "@/lib/debt-customer-match";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // SALES chỉ thấy khách do mình phụ trách; ADMIN thấy toàn bộ.
    const session = await requireSession();
    const customers = await prisma.customer.findMany({
      where: scopeByOwner(session, "salesEmployeeId"),
      orderBy: { customerName: "asc" },
      include: { salesEmployee: { select: { id: true, name: true } } },
    });
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
  email: emailListField,
  salesEmployeeId: z.string().trim().min(1).optional().nullable(),
  paymentTermType: z.enum(["DAYS_FROM_INVOICE", "END_OF_MONTH_OFFSET"]).optional().nullable(),
  paymentTermDays: z.number().int().min(0).optional().nullable(),
  paymentTermMonthOffset: z.number().int().min(0).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const { customerName, contactPerson, email, paymentTermType, paymentTermDays, paymentTermMonthOffset } = parsed.data;
    // Chuẩn hoá mã khách hàng khi tạo — bỏ tiền tố 1 chữ cái + dấu chấm (vd "T.", "C.") và dấu
    // chấm cuối, CÙNG quy tắc với mã lấy từ AMIS (xem lib/debt-customer-match.ts) — tránh lệch mã
    // giữa Khách hàng và Công nợ khi admin gõ tay kèm tiền tố quen dùng ở ghi chú riêng (lỗi thật
    // gặp nhiều lần: "T.TRANGAN", "C.INDUSTRIAL", "MARUKOH.").
    const customerCode = normalizeCustomerCode(parsed.data.customerCode);
    if (!customerCode) return NextResponse.json({ error: "Mã khách hàng không hợp lệ" }, { status: 400 });

    // NVKD tạo khách thì tự là người phụ trách; chỉ ADMIN được chọn NVKD khác.
    const salesEmployeeId = session.user.role === "ADMIN" ? parsed.data.salesEmployeeId : session.user.id;

    const existing = await prisma.customer.findUnique({ where: { customerCode } });
    if (existing) return NextResponse.json({ error: "Mã khách hàng đã tồn tại" }, { status: 409 });

    const customer = await prisma.customer.create({
      data: {
        customerCode,
        customerName,
        contactPerson: contactPerson || null,
        email: normalizeEmailList(email),
        salesEmployeeId: salesEmployeeId || null,
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
