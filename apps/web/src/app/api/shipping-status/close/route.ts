import { NextRequest, NextResponse } from "next/server";
import { setPoManualClosed } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * Nút "Kết thúc đơn" / "Mở lại đơn" ở trang Tiến độ giao hàng — đóng/mở lại thủ công 1 PO khi
 * không cần giao tiếp dù chưa giao đủ SL/giá trị (khách huỷ bớt/không lấy nữa...). Cùng phạm vi
 * quyền với trang xem: SALES chỉ đóng được PO của chính mình (đã bị giới hạn ở query), ADMIN
 * đóng được mọi PO. Xem packages/db/src/po-delivery-sync.ts (setPoManualClosed) để biết cơ chế
 * giữ nguyên qua các lần nhập lại file PO tracking Excel.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const poCode = typeof body.poCode === "string" ? body.poCode.trim() : "";
    const closed = body.closed === true;
    if (!poCode) return NextResponse.json({ error: "Thiếu Số PO" }, { status: 400 });

    const scope = scopeByOwner(session, "salesEmployeeId");
    const result = await setPoManualClosed(poCode, closed, session.user.id, scope);
    if (result.updatedLineCount === 0) {
      return NextResponse.json(
        { error: "Không tìm thấy đơn này hoặc anh không có quyền thao tác" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, updatedLineCount: result.updatedLineCount });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("shipping-status/close POST error", err);
    return NextResponse.json({ error: "Không cập nhật được trạng thái đơn" }, { status: 500 });
  }
}
