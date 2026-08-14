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
    const sheetNameRaw = formData.get("sheetName");
    const sheetName = typeof sheetNameRaw === "string" && sheetNameRaw ? sheetNameRaw : undefined;

    if (!(file instanceof File) || typeof mappingRaw !== "string") {
      return NextResponse.json({ error: "Thiếu file hoặc mapping cột" }, { status: 400 });
    }
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "Thiếu hoặc sai Tháng/Năm áp dụng" }, { status: 400 });
    }

    const mapping: Partial<Record<SalesPlanFieldKey, string>> = JSON.parse(mappingRaw);
    if (!mapping.employeeName) {
      return NextResponse.json({ error: "Cần map cột bắt buộc: Nhân viên kinh doanh" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors, wideMode } = parseSalesPlanWithMapping(buffer, mapping, year, month, sheetName);

    // File "narrow" (1 cột doanh số duy nhất) bắt buộc phải map cột đó — file "wide" (pivot,
    // mỗi tháng 1 cột) thì không cần vì doanh số đã được đọc trực tiếp theo từng cột tháng.
    if (!wideMode && !mapping.targetRevenue) {
      return NextResponse.json({ error: "Cần map cột bắt buộc: Doanh số mục tiêu" }, { status: 400 });
    }

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
        year: row.year,
        month: row.month,
        employeeNameRaw: row.employeeName,
        employeeId,
        productCode: row.productCode,
        productName: row.productName,
        productGroup: row.productGroup,
        targetRevenue: row.targetRevenue,
        targetQuantity: row.targetQuantity,
      });
    }

    // Upload mới sẽ thay thế hoàn toàn kế hoạch cũ của (các) tháng có mặt trong file — ở chế
    // độ wide, 1 file có thể chứa nhiều tháng (vd cả 12 tháng trong năm) nên xoá theo đúng
    // tập tháng thực tế đã đọc được thay vì chỉ tháng chọn trên UI.
    const distinctMonths = Array.from(new Set(linesData.map((l) => l.month)));
    const monthsToClear = distinctMonths.length > 0 ? distinctMonths : [month];

    const result = await prisma.$transaction(async (tx) => {
      await tx.salesPlanLine.deleteMany({ where: { year, month: { in: monthsToClear } } });

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
      wideMode,
      year,
      monthsImported: monthsToClear.sort((a, b) => a - b),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("targets/plan/commit error", err);
    return NextResponse.json({ error: "Import kế hoạch thất bại. Vui lòng kiểm tra lại file." }, { status: 400 });
  }
}
