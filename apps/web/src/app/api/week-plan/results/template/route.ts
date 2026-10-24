import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { buildWeekPlanTemplate } from "@/lib/week-plan-template";

export const dynamic = "force-dynamic";

/** Tải file Excel mẫu nhập kết quả Kế hoạch tuần (đúng cấu trúc bộ đọc ở /results/import). */
export async function GET() {
  try {
    await requireSession();
    const buf = await buildWeekPlanTemplate();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("Mau-ket-qua-ke-hoach-tuan.xlsx")}`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("week-plan template GET error", err);
    return NextResponse.json({ error: "Không tạo được file mẫu" }, { status: 500 });
  }
}
