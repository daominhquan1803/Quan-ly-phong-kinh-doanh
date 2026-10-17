import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * Dữ liệu cho form lập biên bản (quản trị):
 * - ?kind=slips&customer=<tên/mã khách>&q=<số phiếu> -> 40 phiếu đi hàng gần nhất của khách (khớp tên khách trên phiếu, hoặc
 *   Số PO trên dòng hàng thuộc PO của mã khách đó), kèm dòng hàng để chọn mặt hàng lỗi.
 * - ?kind=people -> người chịu trách nhiệm có thể chọn: NVKD đang theo dõi + Admin kinh doanh.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind");

    if (kind === "people") {
      const people = await prisma.user.findMany({
        where: {
          active: true,
          OR: [{ role: "SALES" }, { role: "ADMIN", accessLevel: "OPERATOR" }, { role: "ADMIN", includeInSalesStats: true, amisEmployeeCode: { not: null } }],
        },
        select: { id: true, name: true, role: true, accessLevel: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({
        people: people.map((p) => ({ id: p.id, name: p.name, kind: p.role === "ADMIN" && p.accessLevel === "OPERATOR" ? "ADMIN" : "SALES" })),
      });
    }

    if (kind === "slips") {
      const customer = searchParams.get("customer")?.trim().slice(0, 200) ?? "";
      const customerCode = searchParams.get("customerCode")?.trim().slice(0, 100) ?? "";
      const q = searchParams.get("q")?.trim().slice(0, 50) ?? "";
      if (!customer && !customerCode && !q) return NextResponse.json({ slips: [] });
      const poCodes = customerCode
        ? (
            await prisma.poTrackingLine.findMany({
              where: { customerCode: { equals: customerCode, mode: "insensitive" } },
              distinct: ["poCode"],
              select: { poCode: true },
            })
          ).map((l) => l.poCode)
        : [];
      const slips = await prisma.shipmentSlip.findMany({
        where: {
          AND: [
            {
              OR: [
                ...(customer ? [{ customerName: { contains: customer, mode: "insensitive" as const } }] : []),
                ...(poCodes.length ? [{ items: { some: { poSaleNumber: { in: poCodes } } } }] : []),
                ...(!customer && !poCodes.length ? [{}] : []),
              ],
            },
            ...(q ? [{ slipNumber: { contains: q, mode: "insensitive" as const } }] : []),
          ],
        },
        orderBy: [{ slipDate: "desc" }, { slipNumber: "desc" }],
        take: 40,
        select: {
          id: true,
          slipNumber: true,
          slipDate: true,
          customerName: true,
          items: {
            orderBy: { lineOrder: "asc" },
            select: { id: true, itemCode: true, itemName: true, unit: true, qtyActual: true, qtyRequested: true, poSaleNumber: true },
          },
        },
      });
      return NextResponse.json({ slips });
    }

    return NextResponse.json({ error: "kind phải là slips hoặc people" }, { status: 400 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("defects lookup GET error", err);
    return NextResponse.json({ error: "Không tải được dữ liệu" }, { status: 500 });
  }
}
