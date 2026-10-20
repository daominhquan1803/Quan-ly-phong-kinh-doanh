import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, normalizeCustomerCode } from "@hoanggia/db";
import { requireSystemAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { assignCustomerToUnassignedInvoices } from "@/lib/customer-invoice-sync";

export const dynamic = "force-dynamic";

const schema = z.object({
  employeeId: z.string().min(1, "Chọn người nhận"),
  /** hồ sơ khách đã có, chưa gán */
  customerIds: z.array(z.string().min(1)).max(500).default([]),
  /** khách có đơn nhưng chưa có hồ sơ — tạo hồ sơ rồi gán */
  profiles: z.array(z.object({ customerCode: z.string().trim().min(1), customerName: z.string().trim().min(1) })).max(500).default([]),
});

/** Anh Quân phân khách chưa có người phụ trách cho NVKD (chỉ quản trị hệ thống). Không ghi đè khách đã có người phụ trách. */
export async function POST(req: NextRequest) {
  try {
    await requireSystemAdmin();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const { employeeId, customerIds, profiles } = parsed.data;
    if (customerIds.length + profiles.length === 0) return NextResponse.json({ error: "Chưa chọn khách nào" }, { status: 400 });
    const emp = await prisma.user.findFirst({ where: { id: employeeId, active: true }, select: { id: true, name: true } });
    if (!emp) return NextResponse.json({ error: "Người nhận không hợp lệ" }, { status: 400 });

    let assigned = 0;
    let created = 0;
    const skipped: string[] = [];
    const codes: string[] = [];

    if (customerIds.length) {
      const targets = await prisma.customer.findMany({ where: { id: { in: customerIds }, salesEmployeeId: null }, select: { id: true, customerCode: true } });
      if (targets.length) {
        const res = await prisma.customer.updateMany({ where: { id: { in: targets.map((t) => t.id) }, salesEmployeeId: null }, data: { salesEmployeeId: emp.id } });
        assigned = res.count;
        codes.push(...targets.map((t) => t.customerCode));
      }
      skipped.push(...customerIds.filter((id) => !targets.some((t) => t.id === id)).map(() => "đã có người phụ trách"));
    }
    for (const p of profiles) {
      const code = normalizeCustomerCode(p.customerCode);
      if (!code) {
        skipped.push(`${p.customerName}: mã khách không hợp lệ`);
        continue;
      }
      const exists = await prisma.customer.findUnique({ where: { customerCode: code }, select: { id: true, salesEmployeeId: true } });
      if (exists) {
        if (exists.salesEmployeeId) {
          skipped.push(`${code}: đã có người phụ trách`);
          continue;
        }
        await prisma.customer.update({ where: { id: exists.id }, data: { salesEmployeeId: emp.id } });
        assigned++;
      } else {
        await prisma.customer.create({ data: { customerCode: code, customerName: p.customerName, salesEmployeeId: emp.id } });
        created++;
      }
      codes.push(code);
    }
    for (const c of codes) await assignCustomerToUnassignedInvoices(c, emp.id); // hoá đơn công nợ chưa có NVKD cũng theo

    const total = assigned + created;
    if (total > 0) {
      await prisma.notification.create({
        data: {
          userId: emp.id,
          type: "CARE_DUE_DAILY",
          title: `Anh Quân giao thêm ${total} khách cho bạn`,
          message: `Có ${total} khách mới vào lịch chăm sóc của bạn: ${codes.slice(0, 8).join(", ")}${codes.length > 8 ? "..." : ""}. Hãy liên hệ và ghi kết quả.`,
          link: `/cham-soc?assigned=${Date.now()}`,
        },
      });
    }
    return NextResponse.json({ assigned, created, skipped });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customer-care/assign POST error", err);
    return NextResponse.json({ error: "Không phân được khách" }, { status: 500 });
  }
}
