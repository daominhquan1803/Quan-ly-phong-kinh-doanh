import { NextRequest, NextResponse } from "next/server";
import { prisma, parsePoTrackingExcel, createPoTrackingImportBatch, importPoTrackingRows, PoTrackingParseError } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * Nhập file Excel "PO tracking" (Số PO, SL/giá trị PO, các đợt giao, Trạng thái...) — nguồn
 * chính cho trang Tiến độ giao hàng, thay cho việc chạy tay scripts/import-po-tracking.ts qua
 * SSH mỗi lần anh Quân gửi file mới. Logic parse + ghi DB dùng chung với script CLI, xem
 * packages/db/src/po-tracking-import.ts.
 *
 * File thật từng gặp ~25 nghìn dòng — parse + ghi mất tới vài phút, giữ nguyên trong 1 request
 * HTTP sẽ vượt timeout của reverse proxy trước VPS (đã tái hiện được lỗi 502 Bad Gateway thật).
 * Nên route này trả về `batchId` NGAY sau khi tạo bản ghi batch, còn parse+ghi chạy NỀN (không
 * await) sau khi đã response — app chạy dưới dạng Node server thường trực (Next.js standalone,
 * xem apps/web/Dockerfile), không phải serverless, nên promise chạy nền không bị huỷ giữa chừng.
 * FE poll GET .../import/[batchId] để biết khi nào xong (xem ShippingStatusOverview.tsx).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const batch = await createPoTrackingImportBatch({ fileName: file.name, createdById: session.user.id });

    // Cố tình KHÔNG await — xem docblock trên. Lỗi ở nhánh nền (parse hỏng, DB lỗi giữa chừng...)
    // được ghi vào chính batch (errorReport) qua importPoTrackingRows, hoặc log ra console nếu
    // hỏng trước khi kịp tạo được rows (vd file sai định dạng hoàn toàn).
    (async () => {
      try {
        const rows = parsePoTrackingExcel(buffer);
        await importPoTrackingRows(rows, batch.id);
      } catch (err) {
        const message = err instanceof PoTrackingParseError ? err.message : err instanceof Error ? err.message : String(err);
        console.error("shipping-status/import background error", err);
        await prisma.poTrackingImportBatch.update({
          where: { id: batch.id },
          data: { errorCount: 1, errorReport: [message], completedAt: new Date() },
        });
      }
    })();

    return NextResponse.json({ batchId: batch.id });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("shipping-status/import POST error", err);
    return NextResponse.json({ error: "Nhập file PO tracking thất bại" }, { status: 500 });
  }
}
