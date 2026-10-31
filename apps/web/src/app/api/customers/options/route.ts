import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { effectiveAddresses } from "@/lib/customer-address";

export const dynamic = "force-dynamic";

/**
 * Khách hàng cho ô chọn khách ở form Đăng ký công tác: MỌI NVKD thấy cả khách của đồng nghiệp (đăng ký đi hộ, đăng ký chung) —
 * chỉ trả thông tin tối thiểu (tên, mã, địa chỉ hiệu lực, người phụ trách), không trả công nợ/email.
 */
export async function GET() {
  try {
    await requireSession();
    const rows = await prisma.customer.findMany({
      select: { id: true, customerCode: true, customerName: true, address: true, salesEmployee: { select: { id: true, name: true } } },
      orderBy: { customerName: "asc" },
    });
    const addr = await effectiveAddresses(rows);
    return NextResponse.json({ customers: rows.map((c) => ({ ...c, address: addr.get(c.id) ?? null })) });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customers/options GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách khách hàng" }, { status: 500 });
  }
}
