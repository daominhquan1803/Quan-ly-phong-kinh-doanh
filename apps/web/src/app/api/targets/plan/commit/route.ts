import { NextRequest, NextResponse } from "next/server";
import { prisma, resolveEmployeeIdByName } from "@hoanggia/db";
import { parseSalesPlanWithMapping } from "@/lib/sales-plan-parser";
import { SalesPlanFieldKey } from "@/lib/sales-plan-fields";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();

    const formData = await req.formData();
    const file = formData.get("file");
    const mappingRaw = formData.get("mapping");
    const year = Number(formData.get("year"));
    const month = Number(formData.get("month"));

    if (!(file instanceof File) || typeof mappingRaw !== "string") {
      return NextResponse.json({ error: "Thiếu file hoặc mapping cột" }, { status: 400 });
    }
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "Thiếu hoặc sai Tháng/Năm áp dụng" }, { status: 400 });
    }

    const mapping: Partial<Record<SalesPlanFieldKey, string>> = JSON.parse(mappingRaw);
    if (!mapping.employeeName || !mapping.targetRevenue) {
      return NextResponse.json(
        { error: "Cần map đủ 2 cột bắt buộc: Nhân viên kinh doanh, Doanh số mục tiêu" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors } = parseSalesPlanWithMapping(buffer, mapping);

    const unmatchedNames = new Set<string>();
    const linesData: {
      year: number;
      month: number;
      employeeNameRaw: string;
      employeeId: string | null;
      productCode: string | null;
      productName: string | null;
      productGroup: string | null;
      targetRevenue: number;
      targetQuantity: number | null;
    }[] = [];
    for (const row of rows) {
      const employeeId = await resolveEmployeeIdByName(row.employeeName);
      if (!employeeId) unmatchedNames.add(row.employeeName);
      linesData.push({
        year,
        month,
        employeeNameRaw: row.employeeName,
        employeeId,
        productCode: row.productCode,
        productName: row.productName,
        productGroup: row.productGroup,
        targetRevenue: row.targetRevenue,
        targetQuantity: row.targetQuantity,
      });
    }

    // Upload mới cho 1 tháng sẽ thay thế hoàn toàn kế hoạch cũ của tháng đó.
    const result = await prisma.$transaction(async (tx) => {
      await tx.salesPlanLine.deleteMany({ where: { year, month } });

      const batch = await tx.salesPlanImportBatch.create({
        data: {
          fileName: file.name,
          year,
          month,
          totalRows: rows.length,
          createdCount: linesData.length,
          errorCount: errors.length,
          errorReport: errors,
          createdById: session.user.id,
        },
      });

      if (linesData.length > 0) {
        await tx.salesPlanLine.createMany({
          data: linesData.map((l) => ({ ...l, batchId: batch.id })),
        });
      }

      return batch;
    });

    return NextResponse.json({
      batchId: result.id,
      totalRows: rows.length,
      createdCount: linesData.length,
      errorCount: errors.length,
      errors,
      unmatchedEmployeeNames: Array.from(unmatchedNames),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("targets/plan/commit error", err);
    return NextResponse.json({ error: "Import kế hoạch thất bại. Vui lòng kiểm tra lại file." }, { status: 400 });
  }
}
