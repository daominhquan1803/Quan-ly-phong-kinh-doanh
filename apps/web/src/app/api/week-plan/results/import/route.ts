import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@hoanggia/db";
import { parseExcelDate } from "@/lib/excel-parser";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { matchMetricFromSectionLabel, startOfWeek } from "@/lib/week-plan";

export const dynamic = "force-dynamic";

/**
 * Tải file Excel theo đúng cấu trúc sheet "KẾT QUẢ" trong file mẫu — cột: STT, Mục, Ngày tháng,
 * Khách hàng, Địa chỉ, Nội dung, Sản phẩm quan tâm. Cột "Mục" chỉ có ở dòng đầu mỗi nhóm (các
 * dòng sau cùng nhóm để trống) — tự động lấy Mục của dòng gần nhất phía trên (forward-fill),
 * đúng cách file mẫu trình bày. weekStart của mỗi dòng lấy trực tiếp từ "Ngày tháng" của dòng đó
 * (không ép theo tuần đang xem trên UI) — 1 file có thể chứa nhiều tuần, mỗi dòng tự xếp đúng
 * tuần của nó.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();

    const formData = await req.formData();
    const file = formData.get("file");
    const employeeIdRaw = formData.get("employeeId");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file" }, { status: 400 });
    }

    const employeeId =
      session.user.role === "ADMIN" && typeof employeeIdRaw === "string" && employeeIdRaw
        ? employeeIdRaw
        : session.user.id;
    const employeeExists = await prisma.user.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!employeeExists) return NextResponse.json({ error: "Nhân viên không hợp lệ" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    // KHÔNG dùng readSheet() dùng chung (bật cellDates: true) — xlsx quy đổi ô ngày sang JS Date
    // theo giờ UTC nửa đêm, .getDate() sau đó lại đọc theo giờ máy chủ nên lệch mất 1 ngày khi
    // giờ máy chủ ở múi âm so với UTC (đã phát hiện thật khi test file mẫu: 12/8 bị đọc ra
    // 11/8). Đọc số serial thô rồi tự quy đổi qua parseExcelDate (nhánh number, dùng
    // XLSX.SSF.parse_date_code — không đi qua Date/múi giờ) để tránh hẳn lỗi này.
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames.includes("KẾT QUẢ") ? "KẾT QUẢ" : workbook.SheetNames[0];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: "",
    });
    const [headerRow, ...dataRows] = rows;
    const headers = (headerRow ?? []).map((h) => String(h ?? "").trim());

    const colIdx = {
      metric: headers.findIndex((h) => /mục/i.test(h)),
      date: headers.findIndex((h) => /ngày/i.test(h)),
      customer: headers.findIndex((h) => /khách/i.test(h)),
      address: headers.findIndex((h) => /địa chỉ/i.test(h)),
      content: headers.findIndex((h) => /nội dung/i.test(h)),
      productInterest: headers.findIndex((h) => /sản phẩm/i.test(h)),
    };
    if (colIdx.date < 0 || colIdx.customer < 0) {
      return NextResponse.json(
        { error: 'File không đúng cấu trúc sheet "KẾT QUẢ" mẫu — thiếu cột Ngày tháng hoặc Khách hàng' },
        { status: 400 }
      );
    }

    const errors: { rowNumber: number; message: string }[] = [];
    const toCreate: {
      employeeId: string;
      weekStart: Date;
      metric: "NEW_CONTACT" | "NEW_MEETING" | "EXISTING_VISIT";
      entryDate: Date;
      customerName: string;
      address: string | null;
      content: string | null;
      productInterest: string | null;
    }[] = [];

    let currentMetric: "NEW_CONTACT" | "NEW_MEETING" | "EXISTING_VISIT" | null = null;

    dataRows.forEach((row, i) => {
      const rowNumber = i + 2; // +1 header, +1 về 1-based
      const metricLabelRaw = colIdx.metric >= 0 ? String(row[colIdx.metric] ?? "").trim() : "";
      if (metricLabelRaw) {
        const matched = matchMetricFromSectionLabel(metricLabelRaw);
        if (matched) currentMetric = matched;
      }
      const customerName = String(row[colIdx.customer] ?? "").trim();
      const dateRaw = row[colIdx.date];
      // Dòng trống hoàn toàn (dòng ngăn cách giữa các nhóm trong file mẫu) — bỏ qua, không báo lỗi.
      if (!customerName && (dateRaw === "" || dateRaw == null)) return;

      if (!currentMetric) {
        errors.push({ rowNumber, message: `Không xác định được "Mục" cho dòng này (${metricLabelRaw || "để trống"})` });
        return;
      }
      const entryDate = parseExcelDate(dateRaw);
      if (!entryDate) {
        errors.push({ rowNumber, message: "Ngày tháng không đọc được" });
        return;
      }
      if (!customerName) {
        errors.push({ rowNumber, message: "Thiếu tên khách hàng" });
        return;
      }

      toCreate.push({
        employeeId,
        weekStart: startOfWeek(entryDate),
        metric: currentMetric,
        entryDate,
        customerName,
        address: colIdx.address >= 0 ? String(row[colIdx.address] ?? "").trim() || null : null,
        content: colIdx.content >= 0 ? String(row[colIdx.content] ?? "").trim() || null : null,
        productInterest:
          colIdx.productInterest >= 0 ? String(row[colIdx.productInterest] ?? "").trim() || null : null,
      });
    });

    const batch = await prisma.weekPlanResultImportBatch.create({
      data: {
        fileName: file.name,
        totalRows: dataRows.length,
        createdCount: toCreate.length,
        errorCount: errors.length,
        errorReport: errors.length ? errors : undefined,
        createdById: session.user.id,
      },
    });

    if (toCreate.length > 0) {
      await prisma.weekPlanResultEntry.createMany({
        data: toCreate.map((r) => ({ ...r, importBatchId: batch.id, createdById: session.user.id })),
      });
    }

    return NextResponse.json({
      batchId: batch.id,
      totalRows: dataRows.length,
      createdCount: toCreate.length,
      errorCount: errors.length,
      errors,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("week-plan results import POST error", err);
    return NextResponse.json({ error: "Không đọc được file" }, { status: 500 });
  }
}
