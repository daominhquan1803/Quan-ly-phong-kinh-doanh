import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { parseManualOrderExcel, ManualOrderParseError } from "@/lib/manual-order-parser";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * Đọc thử file Excel "Đơn đặt hàng" (1 file = 1 đơn) để hiện lên form cho người dùng xem/sửa
 * trước khi lưu thật — KHÔNG ghi gì vào DB ở bước này. Cả SALES lẫn ADMIN đều gọi được (SALES tự
 * thêm đơn của mình, ADMIN thêm cho bất kỳ ai) — chặn quyền chọn nhân viên phụ trách ở bước
 * commit, không phải ở đây.
 */
export async function POST(req: NextRequest) {
  try {
    await requireSession();

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file Excel" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let parsed;
    try {
      parsed = parseManualOrderExcel(buffer);
    } catch (err) {
      if (err instanceof ManualOrderParseError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    // Báo trước cho người dùng biết nếu Số PO đã tồn tại — tránh họ sửa hết cả form rồi mới bị
    // chặn ở bước lưu.
    const existing = await prisma.order.findUnique({
      where: { orderCode: parsed.orderCode },
      select: { id: true, orderCode: true },
    });

    return NextResponse.json({ parsed, duplicateOrderId: existing?.id ?? null });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("orders/manual/preview error", err);
    return NextResponse.json({ error: "Không đọc được file Excel. Kiểm tra định dạng file." }, { status: 400 });
  }
}
