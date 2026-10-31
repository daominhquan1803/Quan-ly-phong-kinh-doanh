import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { diagnoseSlipItem, PoLineLite } from "@/lib/shipment-slip-issues";
import { findDefectCandidates, OpenDefectItem } from "@/lib/defect-replacement";

export const dynamic = "force-dynamic";

/** Bảng "Dòng phiếu cần sửa" ở trang Phiếu đi hàng (chỉ ADMIN): các dòng phiếu chưa ghi nhận được vào Tiến độ giao hàng, kèm lý do + gợi ý sửa. */
export async function GET() {
  try {
    await requireAdmin();
    const [items, poLines, openDefects] = await Promise.all([
      prisma.shipmentSlipItem.findMany({
        where: { issueIgnored: false },
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          poSaleNumber: true,
          qtyActual: true,
          shipmentSlip: { select: { id: true, slipNumber: true, slipDate: true, customerName: true } },
        },
      }),
      prisma.poTrackingLine.findMany({ select: { poCode: true, itemCode: true, itemName: true, poQuantity: true, totalDeliveredQty: true } }),
      prisma.defectReport.findMany({
        where: { status: "OPEN" },
        select: {
          id: true,
          reportNumber: true,
          customerName: true,
          items: { select: { id: true, itemCode: true, itemName: true, defectQty: true } },
          replacements: { select: { defectReportItemId: true, quantity: true } },
        },
      }),
    ]);
    // Mã hàng lỗi còn thiếu của biên bản đang mở — để gợi ý "đổi lỗi theo biên bản" cho dòng phiếu không có PO.
    const openItems: OpenDefectItem[] = openDefects.flatMap((d) =>
      d.items.map((i) => ({
        defectReportId: d.id,
        reportNumber: d.reportNumber,
        customerName: d.customerName,
        itemId: i.id,
        itemCode: i.itemCode,
        itemName: i.itemName,
        defectQty: Number(i.defectQty),
        replacedQty: d.replacements.filter((r) => r.defectReportItemId === i.id).reduce((s, r) => s + Number(r.quantity), 0),
      }))
    );
    const allLines: PoLineLite[] = poLines.map((l) => ({
      poCode: l.poCode,
      itemCode: l.itemCode,
      itemName: l.itemName,
      poQuantity: l.poQuantity != null ? Number(l.poQuantity) : null,
      delivered: Number(l.totalDeliveredQty ?? 0),
    }));
    const linesByPo = new Map<string, PoLineLite[]>();
    for (const l of allLines) linesByPo.set(l.poCode, [...(linesByPo.get(l.poCode) ?? []), l]);

    const issues = items
      .map((it) => {
        const issue = diagnoseSlipItem({ ...it, qtyActual: it.qtyActual != null ? Number(it.qtyActual) : null }, linesByPo, allLines);
        return issue && { itemId: it.id, slip: it.shipmentSlip, itemCode: it.itemCode, itemName: it.itemName, poSaleNumber: it.poSaleNumber, qtyActual: it.qtyActual != null ? Number(it.qtyActual) : null,
          ...issue,
          defectCandidates: issue.kind === "NO_PO" ? findDefectCandidates({ itemCode: it.itemCode, itemName: it.itemName, customerName: it.shipmentSlip.customerName }, openItems) : [],
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => (b.slip.slipDate?.getTime() ?? 0) - (a.slip.slipDate?.getTime() ?? 0));
    return NextResponse.json({ issues });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("shipment-slips/issues GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách dòng phiếu cần sửa" }, { status: 500 });
  }
}
