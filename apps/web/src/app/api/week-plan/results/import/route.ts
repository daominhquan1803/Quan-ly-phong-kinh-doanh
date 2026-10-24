import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma, fixSwappedDayMonth } from "@hoanggia/db";
import { parseExcelDate } from "@/lib/excel-parser";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { contactInfoOf, entryCounts, mapImportColumns, NATIONALITIES, SCALE_KEYS, SCALE_LABEL } from "@/lib/week-plan-entry";
import { normalizeVN } from "@/lib/text-normalize";
import { isWeekEntryLocked, matchMetricFromSectionLabel, snapToWeekStart, weekLockedMessage } from "@/lib/week-plan";

export const dynamic = "force-dynamic";

/**
 * Tải file Excel theo đúng cấu trúc sheet "KẾT QUẢ" trong file mẫu — cột: STT, Mục, Ngày tháng,
 * Khách hàng, Địa chỉ, Quốc tịch, Quy mô, Người liên hệ, Số điện thoại, Nhu cầu, Việc đã làm, Hành động tiếp theo, Ngày hẹn nhắc
 * (từ 26/10/2026 phải đủ các cột này thì dòng mới được tính — dòng thiếu vẫn nhập nhưng không tính), Nội dung, Sản phẩm quan tâm. Cột "Mục" chỉ có ở dòng đầu mỗi nhóm (các
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

    const colIdx = mapImportColumns(headers);
    const cell = (row: unknown[], idx: number) => (idx >= 0 ? String(row[idx] ?? "").trim() || null : null);
    const natOf = (v: string | null) => NATIONALITIES.find((n) => normalizeVN(n) === normalizeVN(v ?? "")) ?? null;
    const scaleOf = (v: string | null) => SCALE_KEYS.find((k) => normalizeVN(k) === normalizeVN(v ?? "") || normalizeVN(SCALE_LABEL[k]) === normalizeVN(v ?? "")) ?? null;
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
      metric: "NEW_CONTACT" | "NEW_MEETING";
      entryDate: Date;
      customerName: string;
      address: string | null;
      content: string | null;
      productInterest: string | null;
      contactInfo: string | null;
      nationality: string | null;
      scale: string | null;
      contactName: string | null;
      contactPhone: string | null;
      need: string | null;
      workDone: string | null;
      nextAction: string | null;
      nextActionAt: Date | null;
    }[] = [];

    // Dòng nằm trước mọi ô "Mục" (NVKD quên điền) mặc định tính là "KH liên hệ mới" — theo chốt của
    // anh Quân; số dòng bị mặc định được báo lại cho người tải để lần sau điền đủ cột Mục.
    let currentMetric: "NEW_CONTACT" | "NEW_MEETING" | null = null;
    let defaultedMetricCount = 0;
    let swappedDateCount = 0;

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
        if (metricLabelRaw) {
          errors.push({ rowNumber, message: `Không xác định được "Mục" cho dòng này (${metricLabelRaw})` });
          return;
        }
        currentMetric = "NEW_CONTACT";
        defaultedMetricCount++;
      }
      const parsedDate = parseExcelDate(dateRaw);
      if (!parsedDate) {
        errors.push({ rowNumber, message: "Ngày tháng không đọc được" });
        return;
      }
      // Ngày bị Excel (định dạng Mỹ) đảo ngày/tháng — xem fixSwappedDayMonth.
      const { date: entryDate, swapped } = fixSwappedDayMonth(parsedDate, new Date());
      if (swapped) swappedDateCount++;
      if (!customerName) {
        errors.push({ rowNumber, message: "Thiếu tên khách hàng" });
        return;
      }

      const rowWeekStart = snapToWeekStart(entryDate);
      // Quá hạn nhập của tuần này — chỉ Quản trị viên được nhập bổ sung, bỏ qua dòng của NVKD.
      if (session.user.role !== "ADMIN" && isWeekEntryLocked(rowWeekStart)) {
        errors.push({ rowNumber, message: weekLockedMessage(rowWeekStart) });
        return;
      }

      const contactName = cell(row, colIdx.contactName);
      const contactPhone = cell(row, colIdx.contactPhone);
      const nextActionAtRaw = colIdx.nextActionAt >= 0 ? row[colIdx.nextActionAt] : null;
      toCreate.push({
        employeeId,
        weekStart: rowWeekStart,
        metric: currentMetric,
        entryDate,
        customerName,
        address: colIdx.address >= 0 ? String(row[colIdx.address] ?? "").trim() || null : null,
        content: colIdx.content >= 0 ? String(row[colIdx.content] ?? "").trim() || null : null,
        productInterest:
          colIdx.productInterest >= 0 ? String(row[colIdx.productInterest] ?? "").trim() || null : null,
        contactInfo: contactInfoOf(contactName, contactPhone) ?? cell(row, colIdx.contactInfo),
        nationality: natOf(cell(row, colIdx.nationality)),
        scale: scaleOf(cell(row, colIdx.scale)),
        contactName,
        contactPhone,
        need: cell(row, colIdx.need),
        workDone: cell(row, colIdx.workDone),
        nextAction: cell(row, colIdx.nextAction),
        nextActionAt: nextActionAtRaw === "" || nextActionAtRaw == null ? null : parseExcelDate(nextActionAtRaw),
      });
    });

    // Tải lại cùng 1 file không được nhân đôi dòng đã có (vd tải lại sau khi điền Mục cho các dòng
    // từng bị lỗi) — bỏ qua dòng trùng NVKD + Mục + Ngày + Khách hàng với dữ liệu đã lưu.
    let duplicateCount = 0;
    if (toCreate.length > 0) {
      const existing = await prisma.weekPlanResultEntry.findMany({
        where: {
          employeeId,
          entryDate: {
            gte: new Date(Math.min(...toCreate.map((r) => r.entryDate.getTime()))),
            lte: new Date(Math.max(...toCreate.map((r) => r.entryDate.getTime()))),
          },
        },
        select: { metric: true, entryDate: true, customerName: true },
      });
      const key = (metric: string, d: Date, name: string) => `${metric}|${d.getTime()}|${name.trim().toLowerCase()}`;
      const seen = new Set(existing.map((e) => key(e.metric, e.entryDate, e.customerName)));
      for (let i = toCreate.length - 1; i >= 0; i--) {
        const r = toCreate[i];
        if (seen.has(key(r.metric, r.entryDate, r.customerName))) {
          toCreate.splice(i, 1);
          duplicateCount++;
        }
      }
    }

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

    // Dòng mới (từ 26/10/2026) thiếu thông tin vẫn được lưu để NVKD bổ sung, nhưng chưa tính vào kế hoạch tuần.
    const incompleteCount = toCreate.filter((r) => !entryCounts(r)).length;

    return NextResponse.json({
      batchId: batch.id,
      incompleteCount,
      totalRows: dataRows.length,
      createdCount: toCreate.length,
      duplicateCount,
      defaultedMetricCount,
      swappedDateCount,
      errorCount: errors.length,
      errors,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("week-plan results import POST error", err);
    return NextResponse.json({ error: "Không đọc được file" }, { status: 500 });
  }
}
