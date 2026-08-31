import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const itemSchema = z.object({
  itemCode: z.string().trim().max(200).optional().nullable(),
  itemName: z.string().trim().min(1, "Thiếu tên hàng"),
  unit: z.string().trim().max(50).optional().nullable(),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  totalPrice: z.number().min(0),
});

const createSchema = z.object({
  orderCode: z.string().trim().min(1, "Thiếu Số PO / mã đơn hàng"),
  customerName: z.string().trim().min(1, "Thiếu tên khách hàng"),
  orderDate: z.string().nullable().optional(),
  expectedDeliveryDate: z.string().nullable().optional(),
  items: z.array(itemSchema).min(1, "Cần ít nhất 1 dòng mã hàng"),
  extra: z.record(z.string()).optional(),
  // Chỉ ADMIN cần truyền — SALES tự đăng ký đơn của chính mình, không được chọn người khác.
  employeeId: z.string().trim().min(1).optional(),
});

/**
 * Tạo 1 đơn hàng "thêm thủ công" (nguồn source=MANUAL) từ dữ liệu đã đọc + có thể đã được người
 * dùng sửa lại ở bước xem trước (preview) — KHÔNG nhận lại file Excel ở bước này, tránh phải parse
 * 2 lần và cho phép người dùng sửa số liệu trước khi lưu. Chặn trùng Số PO với đơn đã có sẵn
 * (kể cả đơn đồng bộ từ AMIS) — theo đúng lựa chọn của anh Quân, không tự ghi đè.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const data = parsed.data;

    let salesEmployeeId: string;
    if (session.user.role === "ADMIN") {
      if (!data.employeeId) {
        return NextResponse.json({ error: "Cần chọn nhân viên phụ trách đơn này" }, { status: 400 });
      }
      const employee = await prisma.user.findUnique({ where: { id: data.employeeId } });
      if (!employee || !employee.active) {
        return NextResponse.json({ error: "Nhân viên phụ trách không hợp lệ" }, { status: 400 });
      }
      salesEmployeeId = employee.id;
    } else {
      // SALES chỉ tự thêm đơn của chính mình — bỏ qua employeeId dù có truyền lên.
      salesEmployeeId = session.user.id;
    }

    const existing = await prisma.order.findUnique({ where: { orderCode: data.orderCode } });
    if (existing) {
      return NextResponse.json(
        { error: `Đơn hàng "${data.orderCode}" đã tồn tại trong hệ thống — vào sửa trực tiếp đơn đó thay vì tạo mới.` },
        { status: 409 }
      );
    }

    const totalValue = data.items.reduce((sum, it) => sum + it.totalPrice, 0);

    const order = await prisma.order.create({
      data: {
        orderCode: data.orderCode,
        source: "MANUAL",
        customerName: data.customerName,
        salesEmployeeId,
        orderDate: data.orderDate ? new Date(data.orderDate) : null,
        expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : null,
        status: "NEW",
        totalValue,
        rawData: data.extra && Object.keys(data.extra).length > 0 ? data.extra : undefined,
        items: {
          create: data.items.map((it, i) => ({
            lineOrder: i,
            itemCode: it.itemCode?.trim() || null,
            itemName: it.itemName.trim(),
            unit: it.unit?.trim() || null,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
          })),
        },
      },
      include: { items: true, salesEmployee: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("orders/manual POST error", err);
    return NextResponse.json({ error: "Không tạo được đơn hàng" }, { status: 500 });
  }
}
