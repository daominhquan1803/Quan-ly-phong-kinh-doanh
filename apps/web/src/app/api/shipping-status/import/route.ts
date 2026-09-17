import { NextRequest, NextResponse } from "next/server";
import { parsePoTrackingExcel, importPoTrackingRows, PoTrackingParseError } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * Nhập file Excel "PO tracking" (Số PO, SL/giá trị PO, các đợt giao, Trạng thái...) — nguồn
 * chính cho trang Tiến độ giao hàng, thay cho việc chạy tay scripts/import-po-tracking.ts qua
 * SSH mỗi lần anh Quân gửi file mới. Logic parse + ghi DB dùng chung với script CLI, xem
 * packages/db/src/po-tracking-import.ts.
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
    const rows = parsePoTrackingExcel(buffer);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Không tìm thấy dòng nào có Số PO trong file" }, { status: 400 });
    }

    const result = await importPoTrackingRows(rows, { fileName: file.name, createdById: session.user.id });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof PoTrackingParseError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("shipping-status/import POST error", err);
    return NextResponse.json({ error: "Nhập file PO tracking thất bại" }, { status: 500 });
  }
}
