import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** input type="date" gửi lên chuỗi "yyyy-mm-dd" — new Date("yyyy-mm-dd") của JS hiểu chuỗi này
 * là NỬA ĐÊM UTC (theo chuẩn ECMA-262), không phải nửa đêm giờ Việt Nam như mọi nơi khác trong
 * app đang lưu (vd parseExcelDate). Dựng Date từ 3 số riêng để luôn ra đúng nửa đêm theo múi giờ
 * hệ thống (server đặt TZ=Asia/Ho_Chi_Minh) — nhất quán với cách lưu ngày ở các chỗ khác. */
function parseDateOnlyLocal(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// 1 schema chung cho cả 2 vai trò (dueDate/note optional) — quyền ghi thật sự được chặn bên
// dưới theo isAdmin khi áp dữ liệu, không phải ở bước parse này.
const updateSchema = z.object({
  expectedPaymentDate: z.string().nullable(),
  dueDate: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

/** NVKD tự điền ngày dự kiến thanh toán cho hoá đơn của chính mình -> dùng tính Kế hoạch thu.
 * ADMIN sửa được thêm hạn thanh toán/ghi chú (vd sửa lại hạn thanh toán từ file gốc nếu sai). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const invoice = await prisma.debtInvoice.findUnique({ where: { id: params.id } });
    if (!invoice) return NextResponse.json({ error: "Không tìm thấy hoá đơn" }, { status: 404 });
    if (session.user.role !== "ADMIN" && invoice.salesEmployeeId !== session.user.id) {
      throw new ForbiddenError("Không có quyền sửa công nợ này");
    }

    const body = await req.json();
    const isAdmin = session.user.role === "ADMIN";
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });

    const data: { expectedPaymentDate: Date | null; dueDate?: Date | null; note?: string | null } = {
      expectedPaymentDate: parsed.data.expectedPaymentDate ? parseDateOnlyLocal(parsed.data.expectedPaymentDate) : null,
    };
    if (isAdmin && parsed.data.dueDate !== undefined) {
      data.dueDate = parsed.data.dueDate ? parseDateOnlyLocal(parsed.data.dueDate) : null;
    }
    if (isAdmin && parsed.data.note !== undefined) {
      data.note = parsed.data.note ?? null;
    }

    const updated = await prisma.debtInvoice.update({ where: { id: params.id }, data });
    return NextResponse.json({ invoice: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/[id] PATCH error", err);
    return NextResponse.json({ error: "Không cập nhật được công nợ" }, { status: 500 });
  }
}
