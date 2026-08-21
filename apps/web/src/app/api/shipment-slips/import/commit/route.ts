import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { parseShipmentSlipsWithMapping } from "@/lib/shipment-slip-parser";
import { ShipmentSlipFieldKey } from "@/lib/shipment-slip-fields";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();

    const formData = await req.formData();
    const file = formData.get("file");
    const mappingRaw = formData.get("mapping");
    const sheetNameRaw = formData.get("sheetName");
    const sheetName = typeof sheetNameRaw === "string" && sheetNameRaw ? sheetNameRaw : undefined;

    if (!(file instanceof File) || typeof mappingRaw !== "string") {
      return NextResponse.json({ error: "Thiếu file hoặc mapping cột" }, { status: 400 });
    }

    const mapping: Partial<Record<ShipmentSlipFieldKey, string>> = JSON.parse(mappingRaw);
    if (!mapping.slipNumber) {
      return NextResponse.json({ error: "Cần map cột bắt buộc: Số phiếu" }, { status: 400 });
    }
    if (!mapping.itemName) {
      return NextResponse.json({ error: "Cần map cột bắt buộc: Tên hàng" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { slips, errors } = parseShipmentSlipsWithMapping(buffer, mapping, sheetName);

    const batch = await prisma.shipmentSlipImportBatch.create({
      data: {
        fileName: file.name,
        totalRows: slips.reduce((s, sl) => s + sl.items.length, 0),
        createdCount: 0,
        updatedCount: 0,
        errorCount: errors.length,
        errorReport: errors.length ? errors : undefined,
        createdById: session.user.id,
      },
    });

    let createdCount = 0;
    let updatedCount = 0;

    for (const slip of slips) {
      // Tự khớp đơn hàng nếu "Số PO bán" của dòng hàng đầu tiên trùng đúng 1 mã đơn đang có
      // trong hệ thống — không bắt buộc, chỉ để tiện đối chiếu, không tạo lỗi nếu không khớp.
      const poCode = slip.items.find((it) => it.poSaleNumber)?.poSaleNumber ?? null;
      const matchedOrder = poCode ? await prisma.order.findUnique({ where: { orderCode: poCode }, select: { id: true } }) : null;

      const headerData = {
        slipDate: slip.slipDate,
        receiverName: slip.receiverName,
        customerName: slip.customerName,
        deliveryAddress: slip.deliveryAddress,
        description: slip.description,
        paymentMethod: slip.paymentMethod,
        preparedBy: slip.preparedBy,
        orderId: matchedOrder?.id,
        status: "CONFIRMED" as const,
        importBatchId: batch.id,
      };

      const existing = await prisma.shipmentSlip.findUnique({ where: { slipNumber: slip.slipNumber }, select: { id: true } });

      const saved = existing
        ? await prisma.shipmentSlip.update({ where: { id: existing.id }, data: headerData })
        : await prisma.shipmentSlip.create({
            data: { ...headerData, slipNumber: slip.slipNumber, createdById: session.user.id },
          });

      if (existing) {
        await prisma.shipmentSlipItem.deleteMany({ where: { shipmentSlipId: saved.id } });
        updatedCount++;
      } else {
        createdCount++;
      }

      if (slip.items.length > 0) {
        await prisma.shipmentSlipItem.createMany({
          data: slip.items.map((it, idx) => ({
            shipmentSlipId: saved.id,
            lineOrder: idx,
            itemCode: it.itemCode,
            itemName: it.itemName,
            warehouse: it.warehouse,
            poSaleNumber: it.poSaleNumber,
            unit: it.unit,
            qtyRequested: it.qtyRequested,
            qtyActual: it.qtyActual,
            poCustomerItemCode: it.poCustomerItemCode,
            note: it.note,
          })),
        });
      }
    }

    await prisma.shipmentSlipImportBatch.update({
      where: { id: batch.id },
      data: { createdCount, updatedCount },
    });

    return NextResponse.json({
      batchId: batch.id,
      totalSlips: slips.length,
      createdCount,
      updatedCount,
      errorCount: errors.length,
      errors,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("shipment-slips/import/commit error", err);
    return NextResponse.json({ error: "Import phiếu đi hàng thất bại. Vui lòng kiểm tra lại file." }, { status: 400 });
  }
}
