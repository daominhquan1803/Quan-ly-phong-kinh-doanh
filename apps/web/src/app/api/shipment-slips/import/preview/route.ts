import { NextRequest, NextResponse } from "next/server";
import { previewExcel, listSheetNames } from "@/lib/excel-parser";
import { suggestMapping } from "@/lib/column-mapper";
import { SHIPMENT_SLIP_FIELDS } from "@/lib/shipment-slip-fields";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireSession();

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file Excel" }, { status: 400 });
    }
    const sheetNameRaw = formData.get("sheetName");
    const sheetName = typeof sheetNameRaw === "string" && sheetNameRaw ? sheetNameRaw : undefined;

    const buffer = Buffer.from(await file.arrayBuffer());
    const sheetNames = listSheetNames(buffer);
    const preview = previewExcel(buffer, sheetName);
    const suggestedMapping = suggestMapping(preview.headers, SHIPMENT_SLIP_FIELDS);

    return NextResponse.json({ ...preview, sheetNames, suggestedMapping });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("shipment-slips/import/preview error", err);
    return NextResponse.json({ error: "Không đọc được file Excel. Kiểm tra định dạng file." }, { status: 400 });
  }
}
