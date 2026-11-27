import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSystemAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { assignCustomerToUnassignedInvoices } from "@/lib/customer-invoice-sync";
import { mergeFill } from "@/lib/customer-merge";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ primaryId: z.string().min(1), secondaryIds: z.array(z.string().min(1)).min(1) }),
  z.object({ unmergeId: z.string().min(1) }),
]);

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * Gộp khách trùng (chỉ quản trị hệ thống): chuyển lịch sử chăm sóc / công tác / tiến trình sang hồ sơ chính, điền ô trống,
 * đánh dấu hồ sơ phụ. KHÔNG đụng hoá đơn, đơn hàng, tiền về (giữ mã kế toán). `unmergeId` = bỏ gộp (lịch sử đã chuyển ở lại hồ sơ chính).
 */
export async function POST(req: NextRequest) {
  try {
    await requireSystemAdmin();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return bad("Dữ liệu không hợp lệ");

    if ("unmergeId" in parsed.data) {
      await prisma.customer.update({ where: { id: parsed.data.unmergeId }, data: { mergedIntoId: null } });
      return NextResponse.json({ ok: true });
    }

    const { primaryId } = parsed.data;
    const secondaryIds = [...new Set(parsed.data.secondaryIds)];
    if (secondaryIds.includes(primaryId)) return bad("Mã chính không được nằm trong danh sách mã phụ");
    const rows = await prisma.customer.findMany({ where: { id: { in: [primaryId, ...secondaryIds] } } });
    const primary = rows.find((r) => r.id === primaryId);
    const secondaries = rows.filter((r) => r.id !== primaryId);
    if (!primary || secondaries.length !== secondaryIds.length) return bad("Không tìm thấy khách hàng");
    if (primary.mergedIntoId || primary.lockedAt) return bad("Mã chính đang bị khoá hoặc đã gộp vào mã khác");
    if (secondaries.some((s) => s.mergedIntoId)) return bad("Có mã phụ đã gộp vào mã khác — bỏ gộp trước");

    const fill = mergeFill(primary, secondaries);
    const from = { in: secondaryIds };
    const [care] = await prisma.$transaction([
      prisma.customerCareLog.updateMany({ where: { customerId: from }, data: { customerId: primaryId } }),
      prisma.businessTripStop.updateMany({ where: { customerId: from }, data: { customerId: primaryId } }),
      prisma.customerStageHistory.updateMany({ where: { customerId: from }, data: { customerId: primaryId } }),
      // Hồ sơ từng gộp vào mã phụ thì trỏ thẳng sang mã chính.
      prisma.customer.updateMany({ where: { mergedIntoId: from }, data: { mergedIntoId: primaryId } }),
      prisma.customer.updateMany({ where: { id: from }, data: { mergedIntoId: primaryId, lockedAt: null } }),
      prisma.customer.update({ where: { id: primaryId }, data: fill }),
    ]);
    if (typeof fill.salesEmployeeId === "string") await assignCustomerToUnassignedInvoices(primary.customerCode, fill.salesEmployeeId);

    return NextResponse.json({ merged: secondaries.length, careLogsMoved: care.count });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customers/merge POST error", err);
    return NextResponse.json({ error: "Không gộp được khách hàng" }, { status: 500 });
  }
}
