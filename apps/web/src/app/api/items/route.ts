import { NextResponse } from "next/server";
import { prisma, Prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

interface ItemGroupRow {
  itemKey: string;
  itemCode: string | null;
  itemName: string;
  customers: string[];
  totalQuantity: string;
  totalValue: string;
  lineCount: number;
  lastOrderDate: Date | null;
}

/**
 * Danh sách mã hàng gộp từ OrderItem (đồng bộ sẵn từ AMIS qua Order) — mỗi mã hàng 1 dòng, kèm
 * các khách từng mua + tổng SL/giá trị luỹ kế. Nhóm theo itemCode; đơn không có itemCode thì
 * nhóm theo itemName (ponytail: lấy MAX(itemName) đại diện cho tên hiển thị, không xử lý lệch
 * chính tả giữa các lần nhập — nếu sai lệch nhiều, thêm bước chuẩn hoá tên sau).
 */
export async function GET() {
  try {
    await requireSession();

    const rows = await prisma.$queryRaw<ItemGroupRow[]>(Prisma.sql`
      SELECT
        COALESCE(NULLIF(oi."itemCode", ''), oi."itemName") AS "itemKey",
        MAX(oi."itemCode") AS "itemCode",
        MAX(oi."itemName") AS "itemName",
        array_agg(DISTINCT o."customerName") AS customers,
        SUM(oi.quantity) AS "totalQuantity",
        SUM(oi."totalPrice") AS "totalValue",
        COUNT(*)::int AS "lineCount",
        MAX(o."orderDate") AS "lastOrderDate"
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      GROUP BY "itemKey"
      ORDER BY "lastOrderDate" DESC NULLS LAST
    `);

    const items = rows.map((r) => ({
      itemKey: r.itemKey,
      itemCode: r.itemCode,
      itemName: r.itemName,
      customers: r.customers.filter(Boolean).sort(),
      totalQuantity: Number(r.totalQuantity),
      totalValue: Number(r.totalValue),
      lineCount: r.lineCount,
      lastOrderDate: r.lastOrderDate,
    }));

    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("items GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách hàng hóa" }, { status: 500 });
  }
}
