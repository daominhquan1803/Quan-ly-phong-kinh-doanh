import { NextRequest, NextResponse } from "next/server";
import { previewExcel } from "@/lib/excel-parser";
import { suggestMapping } from "@/lib/column-mapper";
import { SALES_PLAN_FIELDS } from "@/lib/sales-plan-fields";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file Excel" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = previewExcel(buffer);
    const suggestedMapping = suggestMapping(preview.headers, SALES_PLAN_FIELDS);

    return NextResponse.json({ ...preview, suggestedMapping });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("targets/plan/preview error", err);
    return NextResponse.json({ error: "Không đọc được file Excel. Kiểm tra định dạng file." }, { status: 400 });
  }
}
