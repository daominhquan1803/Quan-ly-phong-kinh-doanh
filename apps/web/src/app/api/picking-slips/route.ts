import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { generatePickingSlipNumber } from "@/lib/picking-slips";

export const dynamic = "force-dynamic";

/** Danh sách Phiếu soạn hàng đã tạo — mới nhất trước. */
export async function GET() {
  try {
    await requireAdmin();
    const slips = await prisma.pickingSlip.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        slipNumber: true,
        slipDate: true,
        customerName: true,
        salesEmployeeNameSnapshot: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    });
    return NextResponse.json({ slips });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("picking-slips GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách Phiếu soạn hàng" }, { status: 500 });
  }
}

const itemSchema = z.object({
  poTrackingLineId: z.string().min(1).optional().nullable(),
  poCode: z.string().min(1),
  itemCode: z.string().trim().optional().nullable(),
  itemName: z.string().trim().min(1, "Thiếu tên hàng"),
  customerItemCode: z.string().trim().optional().nullable(),
  unit: z.string().trim().optional().nullable(),
  poQuantitySnapshot: z.number().optional().nullable(),
  remainingQtySnapshot: z.number().optional().nullable(),
  poDateSnapshot: z.string().optional().nullable(),
  qtyToPick: z.number().positive("Số lượng cần soạn phải lớn hơn 0"),
  deliveryDate: z.string().optional().nullable(),
});

const createSchema = z.object({
  customerCode: z.string().trim().optional().nullable(),
  customerName: z.string().trim().min(1, "Thiếu tên khách hàng"),
  deliveryAddress: z.string().trim().max(500).optional().nullable(),
  contactPhone: z.string().trim().max(50).optional().nullable(),
  salesEmployeeId: z.string().trim().optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
  items: z.array(itemSchema).min(1, "Cần chọn ít nhất 1 dòng hàng"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const data = parsed.data;

    let salesEmployeeNameSnapshot: string | null = null;
    let salesEmployeePhoneSnapshot: string | null = null;
    if (data.salesEmployeeId) {
      const emp = await prisma.user.findUnique({ where: { id: data.salesEmployeeId }, select: { name: true, phone: true } });
      if (emp) {
        salesEmployeeNameSnapshot = emp.name;
        salesEmployeePhoneSnapshot = emp.phone;
      }
    }

    const slipNumber = await generatePickingSlipNumber();

    const slip = await prisma.pickingSlip.create({
      data: {
        slipNumber,
        customerCode: data.customerCode || null,
        customerName: data.customerName,
        deliveryAddress: data.deliveryAddress || null,
        contactPhone: data.contactPhone || null,
        salesEmployeeId: data.salesEmployeeId || null,
        salesEmployeeNameSnapshot,
        salesEmployeePhoneSnapshot,
        note: data.note || null,
        createdById: session.user.id,
        items: {
          create: data.items.map((it, idx) => ({
            lineOrder: idx + 1,
            poTrackingLineId: it.poTrackingLineId || null,
            poCode: it.poCode,
            itemCode: it.itemCode || null,
            itemName: it.itemName,
            customerItemCode: it.customerItemCode || null,
            unit: it.unit || null,
            poQuantitySnapshot: it.poQuantitySnapshot ?? null,
            remainingQtySnapshot: it.remainingQtySnapshot ?? null,
            poDateSnapshot: it.poDateSnapshot ? new Date(it.poDateSnapshot) : null,
            qtyToPick: it.qtyToPick,
            deliveryDate: it.deliveryDate ? new Date(it.deliveryDate) : null,
          })),
        },
      },
      select: { id: true, slipNumber: true },
    });

    return NextResponse.json({ slip }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("picking-slips POST error", err);
    return NextResponse.json({ error: "Không tạo được Phiếu soạn hàng" }, { status: 500 });
  }
}
