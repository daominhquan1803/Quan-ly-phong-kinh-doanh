import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { buildCustomerReport } from "@/lib/customer-report";
import { applyImport, diffImport } from "@/lib/customer-report-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nhập lại file Excel báo cáo Danh sách khách: form-data `file` + `mode` = preview (mặc định, chỉ trả danh sách thay đổi)
 * hoặc commit (ghi). NVKD chỉ sửa được khách của mình; quản trị sửa mọi khách (mức Chỉ xem bị middleware chặn ghi).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const form = await req.formData();
    const file = form.get("file");
    const mode = form.get("mode") === "commit" ? "commit" : "preview";
    if (!(file instanceof File)) return NextResponse.json({ error: "Chưa chọn file" }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "File quá lớn (tối đa 15MB)" }, { status: 400 });
    const isAdmin = session.user.role === "ADMIN";
    const report = await buildCustomerReport({ employeeId: isAdmin ? undefined : session.user.id });
    let result;
    try {
      result = await diffImport(Buffer.from(await file.arrayBuffer()), report.rows);
    } catch {
      return NextResponse.json({ error: "Không đọc được file — dùng đúng file Excel tải từ app (.xlsx)" }, { status: 400 });
    }
    if (mode === "commit") {
      const customersUpdated = await applyImport(result.changes, session.user.id, "EXCEL");
      return NextResponse.json({ ...result, committed: true, customersUpdated });
    }
    return NextResponse.json({ ...result, committed: false });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customer-report import error", err);
    return NextResponse.json({ error: "Không nhập được file" }, { status: 500 });
  }
}
