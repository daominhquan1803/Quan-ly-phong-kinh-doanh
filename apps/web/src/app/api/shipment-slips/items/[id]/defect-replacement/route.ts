import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { isDefectComplete, latestDate } from "@/lib/defect-replacement";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  defectReportItemId: z.string().trim().min(1, "Chọn mã hàng lỗi của biên bản"),
  quantity: z.coerce.number().positive("Số lượng đổi phải lớn hơn 0").max(1e9),
});

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Admin xác nhận dòng phiếu (không có PO) là hàng ĐỔI LỖI theo 1 mã hàng lỗi của biên bản đang mở. Cộng dồn SL đổi; mọi mã đã đổi
 * đủ thì biên bản hoàn thành (loại REPLACED, closedAt = ngày phiếu lớn nhất). Dòng phiếu được đánh dấu bỏ qua -> hết cảnh báo thiếu PO.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const { defectReportItemId, quantity } = parsed.data;

    const slipItem = await prisma.shipmentSlipItem.findUnique({ where: { id: params.id }, select: { id: true, qtyActual: true } });
    if (!slipItem) return NextResponse.json({ error: "Không tìm thấy dòng phiếu" }, { status: 404 });

    const closed = await prisma.$transaction(async (tx) => {
      const di = await tx.defectReportItem.findUnique({
        where: { id: defectReportItemId },
        select: { id: true, defectReportId: true, defectQty: true, defectReport: { select: { status: true } } },
      });
      if (!di) throw new HttpError(404, "Không tìm thấy mã hàng lỗi");
      if (di.defectReport.status !== "OPEN") throw new HttpError(400, "Biên bản đã đóng");

      const usedBySlip = Number((await tx.defectReplacement.aggregate({ where: { shipmentSlipItemId: slipItem.id }, _sum: { quantity: true } }))._sum.quantity ?? 0);
      if (usedBySlip + quantity > Number(slipItem.qtyActual ?? 0)) throw new HttpError(400, "Vượt SL thực xuất của dòng phiếu");
      const replaced = Number((await tx.defectReplacement.aggregate({ where: { defectReportItemId }, _sum: { quantity: true } }))._sum.quantity ?? 0);
      if (replaced + quantity > Number(di.defectQty)) throw new HttpError(400, "Vượt SL lỗi còn thiếu của mã hàng này");

      await tx.defectReplacement.create({
        data: { defectReportId: di.defectReportId, defectReportItemId, shipmentSlipItemId: slipItem.id, quantity, confirmedById: session.user.id },
      });
      await tx.shipmentSlipItem.update({ where: { id: slipItem.id }, data: { issueIgnored: true } });

      const items = await tx.defectReportItem.findMany({ where: { defectReportId: di.defectReportId }, select: { id: true, defectQty: true } });
      const sums = await tx.defectReplacement.groupBy({ by: ["defectReportItemId"], where: { defectReportId: di.defectReportId }, _sum: { quantity: true } });
      const replacedOf = new Map(sums.map((s) => [s.defectReportItemId, Number(s._sum.quantity ?? 0)]));
      if (!isDefectComplete(items.map((i) => ({ defectQty: Number(i.defectQty), replacedQty: replacedOf.get(i.id) ?? 0 })))) return false;

      const reps = await tx.defectReplacement.findMany({
        where: { defectReportId: di.defectReportId },
        select: { shipmentSlipItem: { select: { shipmentSlip: { select: { slipNumber: true, slipDate: true } } } } },
      });
      const slips = reps.map((r) => r.shipmentSlipItem.shipmentSlip);
      const numbers = Array.from(new Set(slips.map((s) => s.slipNumber)));
      await tx.defectReport.update({
        where: { id: di.defectReportId },
        data: {
          status: "CLOSED",
          closedAt: latestDate(slips.map((s) => s.slipDate), new Date()),
          closedById: session.user.id,
          resolutionType: "REPLACED",
          resolution: `Đổi lỗi theo phiếu ${numbers.join(", ")}`,
          invoiceAdjusted: false,
        },
      });
      return true;
    });
    return NextResponse.json({ ok: true, closed });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("shipment-slips/items/[id]/defect-replacement POST error", err);
    return NextResponse.json({ error: "Không xác nhận được đổi lỗi" }, { status: 500 });
  }
}
