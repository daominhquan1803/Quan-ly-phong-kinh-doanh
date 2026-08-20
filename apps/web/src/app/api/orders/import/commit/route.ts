import { NextRequest, NextResponse } from "next/server";
import { prisma, OrderStatus } from "@hoanggia/db";
import { parseWithMapping } from "@/lib/excel-parser";
import { ColumnMapping } from "@/lib/column-mapper";
import { mapStatusText } from "@/lib/order-status";
import { normalizeVN } from "@/lib/text-normalize";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();

    const formData = await req.formData();
    const file = formData.get("file");
    const mappingRaw = formData.get("mapping");
    const saveTemplateName = formData.get("saveTemplateName");
    const templateId = formData.get("templateId");
    const headerHashField = formData.get("headerHash");

    if (!(file instanceof File) || typeof mappingRaw !== "string") {
      return NextResponse.json({ error: "Thiếu file hoặc mapping cột" }, { status: 400 });
    }

    const mapping: ColumnMapping = JSON.parse(mappingRaw);
    if (!mapping.orderCode || !mapping.customerName || !mapping.totalValue) {
      return NextResponse.json(
        { error: "Cần map đủ 3 cột bắt buộc: Mã đơn hàng, Khách hàng, Giá trị đơn hàng" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors } = parseWithMapping(buffer, mapping);

    // Danh sách nhân viên hiện có để tự khớp theo tên (chính xác) hoặc alias đã lưu — không
    // lọc theo vai trò vì chủ tài khoản có thể vừa là ADMIN vừa trực tiếp bán hàng.
    const [employees, aliases] = await Promise.all([
      prisma.user.findMany({ where: { active: true } }),
      prisma.employeeAlias.findMany(),
    ]);
    const employeeByNormName = new Map(employees.map((e) => [normalizeVN(e.name), e.id]));
    const aliasMap = new Map(aliases.map((a) => [normalizeVN(a.aliasName), a.employeeId]));

    const unmatchedNames = new Set<string>();

    let templateRecordId: string | undefined = typeof templateId === "string" ? templateId : undefined;
    if (typeof saveTemplateName === "string" && saveTemplateName.trim() && typeof headerHashField === "string") {
      const headerHash = headerHashField;
      const template = await prisma.importTemplate.upsert({
        where: { headerHash },
        update: { columnMapping: mapping as object, name: saveTemplateName.trim() },
        create: {
          name: saveTemplateName.trim(),
          headerHash,
          columnMapping: mapping as object,
          createdById: session.user.id,
        },
      });
      templateRecordId = template.id;
    }

    const batch = await prisma.importBatch.create({
      data: {
        fileName: file.name,
        totalRows: rows.length,
        createdCount: 0,
        updatedCount: 0,
        errorCount: errors.length,
        errorReport: errors,
        createdById: session.user.id,
        templateId: templateRecordId,
      },
    });

    let createdCount = 0;
    let updatedCount = 0;
    const rowErrors = [...errors];

    for (const row of rows) {
      try {
        const salesEmployeeId = row.salesEmployeeNameRaw
          ? aliasMap.get(normalizeVN(row.salesEmployeeNameRaw)) ??
            employeeByNormName.get(normalizeVN(row.salesEmployeeNameRaw)) ??
            null
          : null;

        if (row.salesEmployeeNameRaw && !salesEmployeeId) {
          unmatchedNames.add(row.salesEmployeeNameRaw);
        }

        const existing = await prisma.order.findUnique({ where: { orderCode: row.orderCode } });

        await prisma.order.upsert({
          where: { orderCode: row.orderCode },
          update: {
            customerName: row.customerName,
            customerCode: row.customerCode,
            salesEmployeeNameRaw: row.salesEmployeeNameRaw,
            salesEmployeeId,
            orderDate: row.orderDate,
            expectedDeliveryDate: row.expectedDeliveryDate,
            status: mapStatusText(row.status) as OrderStatus,
            totalValue: row.totalValue,
            poCode: row.poCode,
            importBatchId: batch.id,
          },
          create: {
            orderCode: row.orderCode,
            customerName: row.customerName,
            customerCode: row.customerCode,
            salesEmployeeNameRaw: row.salesEmployeeNameRaw,
            salesEmployeeId,
            orderDate: row.orderDate,
            expectedDeliveryDate: row.expectedDeliveryDate,
            status: mapStatusText(row.status) as OrderStatus,
            totalValue: row.totalValue,
            poCode: row.poCode,
            importBatchId: batch.id,
          },
        });

        if (existing) updatedCount++;
        else createdCount++;
      } catch (rowErr) {
        console.error("import row error", row.rowNumber, rowErr);
        rowErrors.push({ rowNumber: row.rowNumber, message: "Lỗi không xác định khi lưu dòng này" });
      }
    }

    const finalBatch = await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        createdCount,
        updatedCount,
        errorCount: rowErrors.length,
        errorReport: rowErrors,
      },
    });

    return NextResponse.json({
      batchId: finalBatch.id,
      totalRows: rows.length,
      createdCount,
      updatedCount,
      errorCount: rowErrors.length,
      errors: rowErrors,
      unmatchedEmployeeNames: Array.from(unmatchedNames),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("orders/import/commit error", err);
    return NextResponse.json({ error: "Import thất bại. Vui lòng kiểm tra lại file." }, { status: 400 });
  }
}
