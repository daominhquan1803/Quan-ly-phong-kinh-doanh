import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireSystemAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { PRODUCT_GROUPS, type GroupKey } from "@/lib/product-groups";

export const dynamic = "force-dynamic";

const schema = z.object({
  items: z
    .array(z.object({ itemCode: z.string().trim().min(1), groupKey: z.enum(Object.keys(PRODUCT_GROUPS) as [GroupKey, ...GroupKey[]]) }))
    .min(1)
    .max(500),
});

/** Anh xếp nhóm sản phẩm cho mã hàng app chưa tự gom được (chỉ quản trị hệ thống). */
export async function PUT(req: NextRequest) {
  try {
    await requireSystemAdmin();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    for (const it of parsed.data.items) {
      await prisma.itemGroupOverride.upsert({ where: { itemCode: it.itemCode }, create: it, update: { groupKey: it.groupKey } });
    }
    return NextResponse.json({ saved: parsed.data.items.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("item-groups PUT error", err);
    return NextResponse.json({ error: "Không lưu được" }, { status: 500 });
  }
}
