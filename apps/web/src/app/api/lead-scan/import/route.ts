import { NextRequest, NextResponse } from "next/server";
import { requireSystemAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { importLeadWorkbook } from "@/lib/lead-scan-data";

export const dynamic = "force-dynamic";

/**
 * Nhập file Excel tải từ Google Sheet "Theo dõi khách tiềm năng - PKD1" (Tệp → Tải xuống → .xlsx) — CHỈ Quản trị hệ thống.
 * Nhận diện các tab theo tiêu đề cột; nhập lại thì cập nhật theo khoá nguồn (link bài / MST), không tạo trùng.
 */
export async function POST(req: NextRequest) {
  try {
    await requireSystemAdmin();
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Thiếu file" }, { status: 400 });
    const summary = await importLeadWorkbook(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof Error && err.message.startsWith("Không nhận ra")) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("lead-scan import error", err);
    return NextResponse.json({ error: "Không nhập được file" }, { status: 500 });
  }
}
