import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * Khách hàng cho ô chọn khách ở form Đăng ký công tác: MỌI NVKD thấy cả khách của đồng nghiệp (đăng ký đi hộ, đăng ký chung) —
 * chỉ trả thông tin tối thiểu (tên, mã, địa chỉ, người phụ trách), không trả công nợ/email.
 */
export async function GET() {
  try {
    await requireSession();
    const customers = await prisma.customer.findMany({
      select: { id: true, customerCode: true, customerName: true, address: true, salesEmployee: { select: { id: true, name: true } } },
      orderBy: { customerName: "asc" },
    });
    return NextResponse.json({ customers });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customers/options GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách khách hàng" }, { status: 500 });
  }
}
