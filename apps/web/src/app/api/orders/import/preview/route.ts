import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { previewExcel } from "@/lib/excel-parser";
import { hashHeaders, suggestMapping } from "@/lib/column-mapper";
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
    const headerHash = hashHeaders(preview.headers);

    const existingTemplate = await prisma.importTemplate.findUnique({
      where: { headerHash },
    });

    const mapping = existingTemplate
      ? (existingTemplate.columnMapping as Record<string, string>)
      : suggestMapping(preview.headers);

    return NextResponse.json({
      ...preview,
      headerHash,
      matchedTemplate: existingTemplate
        ? { id: existingTemplate.id, name: existingTemplate.name }
        : null,
      suggestedMapping: mapping,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("orders/import/preview error", err);
    return NextResponse.json({ error: "Không đọc được file Excel. Kiểm tra định dạng file." }, { status: 400 });
  }
}
