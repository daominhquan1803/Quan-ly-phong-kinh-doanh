import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, requireSession, requireSystemAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { closeSchema, defectBodySchema, defectInclude, defectScope, vnDate, vnDateTime } from "@/lib/defect-report";

export const dynamic = "force-dynamic";

function fail(err: unknown, what: string) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  console.error(`defects/[id] ${what} error`, err);
  return NextResponse.json({ error: "Có lỗi xảy ra" }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const defect = await prisma.defectReport.findFirst({ where: { id: params.id, ...defectScope(session.user) }, include: defectInclude });
    if (!defect) return NextResponse.json({ error: "Không tìm thấy biên bản" }, { status: 404 });
    return NextResponse.json({ defect });
  } catch (err) {
    return fail(err, "GET");
  }
}

/**
 * - { action: "close", resolution, invoiceAdjusted, adjustedInvoiceNumbers?, invoiceAdjustNote? } — đóng biên bản (quản trị).
 * - { action: "responded" } — ghi nhận đã phản hồi khách (quản trị).
 * - { action: "reopen" } — mở lại (chỉ quản trị hệ thống).
 * - nội dung đầy đủ như khi lập — sửa biên bản đang mở (quản trị).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => null);
    const current = await prisma.defectReport.findUnique({ where: { id: params.id }, select: { id: true, status: true } });

    if (body?.action === "reopen") {
      await requireSystemAdmin();
      if (!current) return NextResponse.json({ error: "Không tìm thấy biên bản" }, { status: 404 });
      const defect = await prisma.defectReport.update({
        where: { id: params.id },
        data: { status: "OPEN", closedAt: null, closedById: null },
        include: defectInclude,
      });
      return NextResponse.json({ defect });
    }

    const session = await requireAdmin();
    if (!current) return NextResponse.json({ error: "Không tìm thấy biên bản" }, { status: 404 });

    if (body?.action === "responded") {
      // Admin ghi nhận đã phản hồi khách (hạn 24h kể từ lúc nhận khiếu nại — KPI Admin).
      const defect = await prisma.defectReport.update({ where: { id: params.id }, data: { respondedAt: new Date() }, include: defectInclude });
      return NextResponse.json({ defect });
    }

    if (body?.action === "close") {
      const parsed = closeSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
      if (current.status === "CLOSED") return NextResponse.json({ error: "Biên bản đã đóng" }, { status: 400 });
      const c = parsed.data;
      const defect = await prisma.defectReport.update({
        where: { id: params.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closedById: session.user.id,
          resolution: c.resolution,
          invoiceAdjusted: c.invoiceAdjusted,
          adjustedInvoiceNumbers: c.invoiceAdjusted ? c.adjustedInvoiceNumbers || null : null,
          invoiceAdjustNote: c.invoiceAdjusted ? c.invoiceAdjustNote || null : null,
        },
        include: defectInclude,
      });
      return NextResponse.json({ defect });
    }

    if (current.status === "CLOSED") return NextResponse.json({ error: "Biên bản đã đóng, mở lại trước khi sửa" }, { status: 400 });
    const parsed = defectBodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const b = parsed.data;
    const dup = await prisma.defectReport.findFirst({
      where: { reportNumber: { equals: b.reportNumber, mode: "insensitive" }, id: { not: params.id } },
      select: { id: true },
    });
    if (dup) return NextResponse.json({ error: `Số biên bản ${b.reportNumber} đã có` }, { status: 409 });
    let deliveryDate = b.deliveryDate ? vnDate(b.deliveryDate) : null;
    if (b.shipmentSlipId && !deliveryDate) {
      deliveryDate = (await prisma.shipmentSlip.findUnique({ where: { id: b.shipmentSlipId }, select: { slipDate: true } }))?.slipDate ?? null;
    }
    const userIds = Array.from(new Set(b.responsibleUserIds));
    const defect = await prisma.$transaction(async (tx) => {
      await tx.defectReportItem.deleteMany({ where: { defectReportId: params.id } });
      await tx.defectResponsible.deleteMany({ where: { defectReportId: params.id } });
      return tx.defectReport.update({
        where: { id: params.id },
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
          items: { create: b.items.map((i) => ({ ...i, slipItemId: i.slipItemId || null, itemCode: i.itemCode || null, unit: i.unit || null, deliveredQty: i.deliveredQty ?? null })) },
          responsibles: { create: userIds.map((userId) => ({ userId })) },
        },
        include: defectInclude,
      });
    });
    return NextResponse.json({ defect });
  } catch (err) {
    return fail(err, "PATCH");
  }
}

/** Xoá biên bản — chỉ quản trị hệ thống (biên bản tính vào KPI). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSystemAdmin();
    await prisma.defectReport.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, "DELETE");
  }
}
