import { NextRequest, NextResponse } from "next/server";
import { previewExcel, listSheetNames } from "@/lib/excel-parser";
import { suggestMapping } from "@/lib/column-mapper";
import { SALES_PLAN_FIELDS } from "@/lib/sales-plan-fields";
import { detectMonthColumns } from "@/lib/sales-plan-parser";
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

    const sheetNameRaw = formData.get("sheetName");
    const sheetName = typeof sheetNameRaw === "string" && sheetNameRaw ? sheetNameRaw : undefined;
    const yearRaw = Number(formData.get("year"));
    const year = Number.isFinite(yearRaw) && yearRaw > 0 ? yearRaw : new Date().getFullYear();

    const buffer = Buffer.from(await file.arrayBuffer());
    const sheetNames = listSheetNames(buffer);
    const preview = previewExcel(buffer, sheetName);
    const suggestedMapping = suggestMapping(preview.headers, SALES_PLAN_FIELDS);
    // File dạng pivot table (1 cột/tháng, vd "Thg4.26") sẽ có các cột này — wizard dùng để
    // tự chuyển sang chế độ nhập nhiều tháng cùng lúc, không cần map cột doanh số thủ công.
    const monthColumnsDetected = detectMonthColumns(preview.headers, year);

    return NextResponse.json({ ...preview, sheetNames, suggestedMapping, monthColumnsDetected });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("targets/plan/preview error", err);
    return NextResponse.json({ error: "Không đọc được file Excel. Kiểm tra định dạng file." }, { status: 400 });
  }
}
