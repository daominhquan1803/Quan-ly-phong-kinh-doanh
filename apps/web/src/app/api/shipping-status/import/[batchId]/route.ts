import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** FE poll route này sau khi POST .../import trả về batchId — xem docblock route POST cùng thư
 * mục cha để biết lý do tách nền thay vì trả kết quả trong 1 request. `processedRows` đếm số
 * PoTrackingLine đã gắn importBatchId này (tăng dần trong lúc còn chạy) — dùng làm thanh tiến độ
 * gần đúng, không cần chính xác tuyệt đối. */
export async function GET(_req: Request, { params }: { params: { batchId: string } }) {
  try {
    await requireAdmin();

    const batch = await prisma.poTrackingImportBatch.findUnique({ where: { id: params.batchId } });
    if (!batch) return NextResponse.json({ error: "Không tìm thấy lượt nhập" }, { status: 404 });

    const processedRows = await prisma.poTrackingLine.count({ where: { importBatchId: batch.id } });

    return NextResponse.json({
      done: batch.completedAt !== null,
      totalRows: batch.totalRows,
      processedRows,
      createdCount: batch.createdCount,
      updatedCount: batch.updatedCount,
      errorCount: batch.errorCount,
      errors: (batch.errorReport as string[] | null) ?? [],
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("shipping-status/import/[batchId] GET error", err);
    return NextResponse.json({ error: "Không tải được trạng thái nhập file" }, { status: 500 });
  }
}
