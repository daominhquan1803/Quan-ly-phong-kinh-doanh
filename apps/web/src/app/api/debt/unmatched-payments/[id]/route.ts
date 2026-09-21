import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * "Xoá" 1 khoản Tiền về chưa khớp = BỎ QUA (matchStatus = "IGNORED"), KHÔNG xoá bản ghi: sourceHash phải
 * còn để lần upload file "Tiền về" sau không tạo lại đúng dòng đó (chống trùng theo hash). Dùng khi tiền
 * đã được ghi nhận bằng cách khác (vd admin đã nhập tay tiền về cho hoá đơn) hoặc không cần theo dõi.
 * Các phần đã gắn vào hoá đơn (khoản PARTIAL) giữ nguyên — chỉ bỏ qua phần chưa khớp còn lại.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    const payment = await prisma.debtPayment.findUnique({ where: { id: params.id }, select: { matchStatus: true, note: true } });
    if (!payment) return NextResponse.json({ error: "Không tìm thấy khoản tiền về" }, { status: 404 });
    if (payment.matchStatus !== "UNMATCHED" && payment.matchStatus !== "PARTIAL") {
      return NextResponse.json({ error: "Khoản tiền về này đã được xử lý rồi" }, { status: 409 });
    }
    const stamp = `Bỏ qua bởi ${session.user.name ?? "Quản trị viên"} ngày ${new Date().toLocaleDateString("vi-VN")}`;
    await prisma.debtPayment.update({
      where: { id: params.id },
      data: { matchStatus: "IGNORED", note: payment.note ? `${payment.note} | ${stamp}` : stamp },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/unmatched-payments/[id] DELETE error", err);
    return NextResponse.json({ error: "Không bỏ qua được khoản tiền về" }, { status: 500 });
  }
}
