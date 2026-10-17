import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@hoanggia/db";
import { requireAdmin, requireSession, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { defectBodySchema, defectInclude, defectScope, vnDate, vnDateTime } from "@/lib/defect-report";

export const dynamic = "force-dynamic";

/** Danh sách biên bản hàng lỗi. ?status=OPEN|CLOSED|ALL &month=YYYY-MM (theo ngày lập) &q=tìm số BB/khách/mặt hàng. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const month = searchParams.get("month");
    const q = searchParams.get("q")?.trim().slice(0, 100);

    const where: Prisma.DefectReportWhereInput = { ...defectScope(session.user) };
    if (status === "OPEN" || status === "CLOSED") where.status = status;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      where.reportDate = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    }
    if (q) {
      where.OR = [
        { reportNumber: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { customerCode: { contains: q, mode: "insensitive" } },
        { items: { some: { OR: [{ itemName: { contains: q, mode: "insensitive" } }, { itemCode: { contains: q, mode: "insensitive" } }] } } },
      ];
    }

    const defects = await prisma.defectReport.findMany({
      where,
      include: defectInclude,
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
      take: 300,
    });
    return NextResponse.json({ defects });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("defects GET error", err);
    return NextResponse.json({ error: "Không tải được biên bản hàng lỗi" }, { status: 500 });
  }
}

/** Lập biên bản — quản trị (Admin kinh doanh / quản trị hệ thống). */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const parsed = defectBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const b = parsed.data;

    const dup = await prisma.defectReport.findFirst({ where: { reportNumber: { equals: b.reportNumber, mode: "insensitive" } }, select: { id: true } });
    if (dup) return NextResponse.json({ error: `Số biên bản ${b.reportNumber} đã có` }, { status: 409 });

    let deliveryDate = b.deliveryDate ? vnDate(b.deliveryDate) : null;
    if (b.shipmentSlipId) {
      const slip = await prisma.shipmentSlip.findUnique({ where: { id: b.shipmentSlipId }, select: { slipDate: true } });
      if (!slip) return NextResponse.json({ error: "Không tìm thấy phiếu đi hàng" }, { status: 400 });
      deliveryDate = deliveryDate ?? slip.slipDate;
    }
    const userIds = Array.from(new Set(b.responsibleUserIds));
    if (userIds.length) {
      const found = await prisma.user.count({ where: { id: { in: userIds }, active: true } });
      if (found !== userIds.length) return NextResponse.json({ error: "Người chịu trách nhiệm không hợp lệ" }, { status: 400 });
    }

    const defect = await prisma.defectReport.create({
      data: {
        reportNumber: b.reportNumber,
        reportDate: vnDate(b.reportDate),
        customerCode: b.customerCode || null,
        customerName: b.customerName,
        shipmentSlipId: b.shipmentSlipId || null,
        deliveryDate,
        description: b.description,
        otherResponsible: b.otherResponsible || null,
        receivedAt: vnDateTime(b.receivedAt),
        createdById: session.user.id,
        items: { create: b.items.map((i) => ({ ...i, slipItemId: i.slipItemId || null, itemCode: i.itemCode || null, unit: i.unit || null, deliveredQty: i.deliveredQty ?? null })) },
        responsibles: { create: userIds.map((userId) => ({ userId })) },
      },
      include: defectInclude,
    });
    return NextResponse.json({ defect }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("defects POST error", err);
    return NextResponse.json({ error: "Không lưu được biên bản hàng lỗi" }, { status: 500 });
  }
}
