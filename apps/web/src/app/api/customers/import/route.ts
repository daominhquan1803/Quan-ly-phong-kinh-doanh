import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { parseCustomerListExcel } from "@/lib/customer-import-parser";
import { normalizeCustomerCode } from "@/lib/debt-customer-match";

export const dynamic = "force-dynamic";

/** AMIS lưu "Người liên hệ" trong rawData của Order dạng "Tên/SĐT" (vd "Mr Vương/ 0964599799")
 * — field contact_name, đã xác nhận qua dữ liệu thật production (xem trao đổi 18/09/2026). */
function extractContactName(rawData: unknown): string | null {
  if (!rawData || typeof rawData !== "object") return null;
  const v = (rawData as Record<string, unknown>).contact_name;
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, mergedFromDuplicates } = parseCustomerListExcel(buffer);

    // Tra cứu Tên khách hàng (khi file để trống) + Người liên hệ (contact_name trong rawData)
    // từ đơn hàng AMIS gần nhất của đúng mã khách hàng đó — CHUẨN HOÁ mã trước khi so khớp, vì
    // Order.customerCode và mã trong file "Danh sách khách hàng" có thể khác nhau về hoa/thường
    // hoặc khoảng trắng thừa (cùng cách chuẩn hoá đã dùng cho import Công nợ gốc).
    const codesSet = new Set(rows.map((r) => normalizeCustomerCode(r.customerCode)));
    const orders = await prisma.order.findMany({
      where: { customerCode: { not: null } },
      select: { customerCode: true, customerName: true, rawData: true },
      orderBy: { orderDate: "desc" },
      distinct: ["customerCode"],
    });
    const orderByNormCode = new Map<string, { customerName: string; contactPerson: string | null }>();
    for (const o of orders) {
      if (!o.customerCode) continue;
      const norm = normalizeCustomerCode(o.customerCode);
      if (!codesSet.has(norm)) continue; // chỉ giữ những mã thật sự cần, tránh giữ cả bảng Order trong bộ nhớ
      if (!orderByNormCode.has(norm)) {
        orderByNormCode.set(norm, { customerName: o.customerName, contactPerson: extractContactName(o.rawData) });
      }
    }

    const existingCustomers = await prisma.customer.findMany({ select: { customerCode: true, contactPerson: true } });
    const existingByCode = new Map(existingCustomers.map((c) => [c.customerCode, c]));

    let createdCount = 0;
    let updatedCount = 0;
    const unrecognizedTerms: string[] = [];
    const noNameFound: string[] = [];

    for (const row of rows) {
      const normCode = normalizeCustomerCode(row.customerCode);
      const fromOrder = orderByNormCode.get(normCode);
      const customerName = row.customerName ?? fromOrder?.customerName ?? null;
      if (!customerName) {
        noNameFound.push(row.customerCode);
        continue; // không có tên từ file lẫn AMIS — bỏ qua, không tạo khách hàng thiếu tên
      }
      if (row.unrecognizedTermRaw) unrecognizedTerms.push(`${row.customerCode}: "${row.unrecognizedTermRaw}"`);

      const existing = existingByCode.get(row.customerCode);
      const data = {
        customerName,
        paymentTermType: row.paymentTermType,
        paymentTermDays: row.paymentTermDays,
        paymentTermMonthOffset: row.paymentTermMonthOffset,
        // Không ghi đè Người liên hệ đã có sẵn (có thể admin đã tự sửa tay) — chỉ điền khi đang trống.
        ...((!existing || !existing.contactPerson) && fromOrder?.contactPerson
          ? { contactPerson: fromOrder.contactPerson }
          : {}),
      };

      if (existing) {
        await prisma.customer.update({ where: { customerCode: row.customerCode }, data });
        updatedCount++;
      } else {
        await prisma.customer.create({ data: { customerCode: row.customerCode, ...data } });
        createdCount++;
      }
    }

    return NextResponse.json({
      totalRows: rows.length,
      mergedFromDuplicates,
      createdCount,
      updatedCount,
      skippedNoName: noNameFound.length,
      noNameSamples: noNameFound.slice(0, 20),
      unrecognizedTermCount: unrecognizedTerms.length,
      unrecognizedTermSamples: unrecognizedTerms.slice(0, 20),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customers/import POST error", err);
    return NextResponse.json({ error: "Import danh sách khách hàng thất bại." }, { status: 500 });
  }
}
