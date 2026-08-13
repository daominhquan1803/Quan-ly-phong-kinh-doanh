import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { createShipmentSlipSchema } from "@/lib/validation/shipment-slip";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();

    const slips = await prisma.shipmentSlip.findMany({
      where: {
        ...scopeByOwner(session, "createdById"),
        ...(q
          ? {
              OR: [
                { slipNumber: { contains: q, mode: "insensitive" } },
                { customerName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        slipNumber: true,
        slipDate: true,
        customerName: true,
        status: true,
        imageThumbPath: true,
        createdBy: { select: { name: true } },
        order: { select: { orderCode: true } },
      },
    });

    return NextResponse.json({ slips });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("shipment-slips GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách phiếu" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = createShipmentSlipSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const data = parsed.data;

    const existing = await prisma.shipmentSlip.findUnique({ where: { slipNumber: data.slipNumber } });
    if (existing) {
      return NextResponse.json({ error: `Số phiếu ${data.slipNumber} đã tồn tại` }, { status: 409 });
    }

    const slip = await prisma.shipmentSlip.create({
      data: {
        slipNumber: data.slipNumber,
        slipDate: data.slipDate ? new Date(data.slipDate) : null,
        receiverName: data.receiverName,
        customerName: data.customerName,
        deliveryAddress: data.deliveryAddress,
        description: data.description,
        paymentMethod: data.paymentMethod,
        preparedBy: data.preparedBy,
        imagePath: data.imagePath,
        imageThumbPath: data.imageThumbPath,
        orderId: data.orderId || null,
        ocrRawResponse: data.ocrRawResponse as object | undefined,
        ocrConfidenceNote: data.ocrConfidenceNote as object | undefined,
        status: "CONFIRMED",
        createdById: session.user.id,
        items: {
          create: data.items.map((item, i) => ({
            lineOrder: i,
            itemCode: item.itemCode,
            itemName: item.itemName,
            warehouse: item.warehouse,
            poSaleNumber: item.poSaleNumber,
            unit: item.unit,
            qtyRequested: item.qtyRequested,
            qtyActual: item.qtyActual,
            poCustomerItemCode: item.poCustomerItemCode,
            note: item.note,
          })),
        },
      },
      include: { items: true },
    });

    return NextResponse.json({ slip }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("shipment-slips POST error", err);
    return NextResponse.json({ error: "Không lưu được phiếu đi hàng" }, { status: 500 });
  }
}
