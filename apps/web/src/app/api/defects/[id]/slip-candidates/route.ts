import { NextRequest, NextResponse } from "next/server";
import { prisma, stripItemCodeVersionSuffix } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { findDefectCandidates, OpenDefectItem } from "@/lib/defect-replacement";

export const dynamic = "force-dynamic";

const MAX_SLIP_LINES = 200;
const MAX_RESULTS = 50;

/**
 * Admin tự nối phiếu đổi lỗi vào 1 biên bản đang mở: các dòng phiếu đi hàng KHÔNG có Số PO, cùng mã/tên hàng với mã hàng lỗi còn thiếu,
 * còn SL chưa nối (kể cả dòng đã bấm "bỏ qua"). Nối bằng POST /api/shipment-slips/items/[id]/defect-replacement.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const defect = await prisma.defectReport.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        reportNumber: true,
        customerName: true,
        items: { select: { id: true, itemCode: true, itemName: true, defectQty: true } },
        replacements: { select: { defectReportItemId: true, quantity: true } },
      },
    });
    if (!defect) return NextResponse.json({ error: "Không tìm thấy biên bản" }, { status: 404 });
    if (defect.status !== "OPEN") return NextResponse.json({ candidates: [] });

    const open: OpenDefectItem[] = defect.items
      .map((i) => ({
        defectReportId: defect.id,
        reportNumber: defect.reportNumber,
        customerName: defect.customerName,
        itemId: i.id,
        itemCode: i.itemCode,
        itemName: i.itemName,
        defectQty: Number(i.defectQty),
        replacedQty: defect.replacements.filter((r) => r.defectReportItemId === i.id).reduce((s, r) => s + Number(r.quantity), 0),
      }))
      .filter((o) => o.defectQty - o.replacedQty > 0);
    if (open.length === 0) return NextResponse.json({ candidates: [] });

    const codes = Array.from(new Set(open.map((o) => (o.itemCode ? stripItemCodeVersionSuffix(o.itemCode) : "")).filter(Boolean)));
    const names = Array.from(new Set(open.map((o) => o.itemName)));
    const slipItems = await prisma.shipmentSlipItem.findMany({
      where: {
        AND: [
          { OR: [{ poSaleNumber: null }, { poSaleNumber: "" }] },
          { qtyActual: { gt: 0 } },
          { OR: [...codes.map((c) => ({ itemCode: { startsWith: c } })), ...names.map((n) => ({ itemName: { equals: n, mode: "insensitive" as const } }))] },
        ],
      },
      select: { id: true, itemCode: true, itemName: true, qtyActual: true, shipmentSlip: { select: { id: true, slipNumber: true, slipDate: true, customerName: true } } },
      orderBy: { shipmentSlip: { slipDate: "desc" } },
      take: MAX_SLIP_LINES,
    });
    const used = await prisma.defectReplacement.groupBy({
      by: ["shipmentSlipItemId"],
      where: { shipmentSlipItemId: { in: slipItems.map((s) => s.id) } },
      _sum: { quantity: true },
    });
    const usedOf = new Map(used.map((u) => [u.shipmentSlipItemId, Number(u._sum.quantity ?? 0)]));

    const candidates = slipItems.flatMap((s) => {
      const availableQty = Number(s.qtyActual ?? 0) - (usedOf.get(s.id) ?? 0);
      if (availableQty <= 0) return [];
      return findDefectCandidates({ itemCode: s.itemCode, itemName: s.itemName, customerName: s.shipmentSlip.customerName }, open).map((c) => ({
        slipItemId: s.id,
        slipNumber: s.shipmentSlip.slipNumber,
        slipDate: s.shipmentSlip.slipDate,
        slipCustomerName: s.shipmentSlip.customerName,
        itemCode: s.itemCode,
        itemName: s.itemName,
        availableQty,
        defectReportItemId: c.itemId,
        defectItemName: c.itemName,
        remaining: c.remaining,
        sameCustomer: c.sameCustomer,
      }));
    });
    candidates.sort((a, b) => Number(b.sameCustomer) - Number(a.sameCustomer) || (b.slipDate?.getTime() ?? 0) - (a.slipDate?.getTime() ?? 0));
    return NextResponse.json({ candidates: candidates.slice(0, MAX_RESULTS) });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("defects/[id]/slip-candidates GET error", err);
    return NextResponse.json({ error: "Không tải được phiếu đổi lỗi" }, { status: 500 });
  }
}
