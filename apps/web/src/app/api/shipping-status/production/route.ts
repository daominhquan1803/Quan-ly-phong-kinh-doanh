import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { loadProductionLines } from "@/lib/production-lines";
import { unmatchedLsx } from "@/lib/production-match";

export const dynamic = "force-dynamic";

/** Tiến độ sản xuất của các dòng PO còn nợ hàng: ai cũng xem được, NVKD chỉ thấy hàng của mình. */
export async function GET() {
  try {
    const session = await requireSession();
    const { rows, syncedAt, dataSince, lines } = await loadProductionLines(scopeByOwner(session, "salesEmployeeId"));
    if (!rows.length) return NextResponse.json({ syncedAt: null, lines: [], unmatchedLsx: [] });

    // Danh sách để đối chiếu số liệu: chỉ admin.
    let unmatched: { lsxNo: string; poCodes: string[]; itemCode: string; customerName: string | null }[] = [];
    if (session.user.role === "ADMIN") {
      const all = await prisma.poTrackingLine.findMany({ select: { poCode: true, itemCode: true, salesEmployeeId: true } });
      unmatched = unmatchedLsx(all.map((l) => ({ ...l, hasSalesEmployee: Boolean(l.salesEmployeeId) })), rows).map((r) => ({ lsxNo: r.lsxNo, poCodes: r.poCodes, itemCode: r.itemCode, customerName: r.customerName }));
    }

    return NextResponse.json({ syncedAt, dataSince, lines, unmatchedLsx: unmatched });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("shipping-status/production GET error", err);
    return NextResponse.json({ error: "Không tải được tiến độ sản xuất" }, { status: 500 });
  }
}
