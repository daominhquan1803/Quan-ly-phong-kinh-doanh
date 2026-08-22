/**
 * Nhập/cập nhật file Excel theo dõi PO + giao hàng độc lập (không qua AMIS) — anh Quân gửi
 * file này định kỳ (thường hàng ngày), mỗi lần gửi là 1 bản snapshot đầy đủ, chạy lại import
 * này sẽ tự cập nhật đúng các dòng đã có (theo naturalKey) và tạo mới các dòng chưa từng thấy.
 *
 * Cấu trúc file (sheet "Sheet1", dòng 1 trống, dòng 2 = header, dữ liệu từ dòng 3):
 * NVKD | Mã khách hàng | Tháng PO | Số PO | Mã hàng | Tên SP | Tên Hoá đơn | Mã KH | Tháng |
 * Ngày PO | SL PO | ĐVT | Giá thực | Giá HĐ | Ngày Y/C giao | NOTE | Ngày còn lại |
 * Ngày giao lần 1 | SL Giao L1 | Giá trị giao L1 | Ngày giao lần 2 | SL Giao L2 | GT giao L2 |
 * Ngày giao lần 3 | SL Giao L3 | GT giao L3 | Tổng SL giao | SL Chưa giao | Trạng thái |
 * G.Trị PO | G.Trị Thực giao | G.Trị còn lại | Nội Dung
 *
 * Đây là NGUỒN CHÍNH cho "Doanh số"/"Giá trị PO" toàn app từ nay (xem model PoTrackingLine
 * trong schema.prisma để hiểu lý do) — mỗi dòng hàng có thể sinh tối đa 3 PoDeliveryEvent
 * (1 event/đợt giao có ngày+giá trị), dùng để cộng dồn doanh số đúng theo tháng thật.
 *
 * Từ khi có "Phiếu đi hàng" (nhập Excel riêng, xem api/shipment-slips/import), các cột "Ngày/SL/
 * GT giao lần 1/2/3" ở đây trở thành "nền" (baseline) — phần đã giao qua Phiếu đi hàng được
 * CỘNG THÊM vào nền này khi tính deliveredValue/remainingValue/totalDeliveredQty/remainingQty/
 * statusRaw hiển thị, không bị mất khi file này được gửi lại (xem @hoanggia/db/po-delivery-sync).
 *
 * Cách chạy: npx tsx scripts/import-po-tracking.ts <file.xlsx> <email người chạy> [--dry-run]
 */
import * as XLSX from "xlsx";
import {
  prisma,
  getSlipAggForAllLines,
  computeLineDeliveryFields,
  normPoStatus,
  PO_CLOSED_STATUS,
  contentIndicatesNoLongerNeeded,
} from "@hoanggia/db";
import path from "path";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const excelPathArg = args[0];
const runByEmail = args[1];
const dryRun = process.argv.includes("--dry-run");

if (!excelPathArg || !runByEmail) {
  console.error(
    "Cách dùng: npx tsx scripts/import-po-tracking.ts <file.xlsx> <email người chạy> [--dry-run]"
  );
  process.exit(1);
}
const EXCEL_PATH = path.resolve(excelPathArg);

// Chỉ 4 mã NVKD này (sau khi chuẩn hoá hoa/trim) được gán vào tài khoản hệ thống — xác nhận
// bằng đối chiếu tên khách hàng trùng khớp dữ liệu AMIS. Mã khác giữ nguyên dạng text, không
// suy đoán gán nhầm người.
const NVKD_TO_AMIS_CODE: Record<string, string> = {
  TANDT: "DANGTAN",
  QUANDM: "MINHQUAN",
  TUNGNT: "THANHTUNG",
  DUNGP: "PHAMDUNG",
};

interface ParsedRow {
  nvkdCodeRaw: string | null;
  customerCode: string | null;
  poMonthLabel: string | null;
  poCode: string;
  itemCode: string | null;
  itemName: string | null;
  invoiceName: string | null;
  customerItemCode: string | null;
  monthLabel: string | null;
  poDate: Date | null;
  poQuantity: number | null;
  unit: string | null;
  actualPrice: number | null;
  contractPrice: number | null;
  requestedDeliveryDate: Date | null;
  note: string | null;
  statusRaw: string | null;
  delivery1: { date: Date; qty: number; value: number } | null;
  delivery2: { date: Date; qty: number; value: number } | null;
  delivery3: { date: Date; qty: number; value: number } | null;
  totalDeliveredQty: number | null;
  remainingQty: number | null;
  poValue: number;
  deliveredValue: number;
  remainingValue: number;
  content: string | null;
}

function toDate(v: unknown): Date | null {
  return v instanceof Date && !isNaN(v.getTime()) ? v : null;
}
function toNum(v: unknown): number | null {
  return typeof v === "number" && !isNaN(v) ? v : null;
}
function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function parseDeliverySlot(dateV: unknown, qtyV: unknown, valueV: unknown) {
  const date = toDate(dateV);
  const qty = toNum(qtyV) ?? 0;
  const value = toNum(valueV) ?? 0;
  if (!date || (qty === 0 && value === 0)) return null;
  return { date, qty, value };
}

function readExcel(): ParsedRow[] {
  const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });
  const ws = wb.Sheets["Sheet1"];
  if (!ws) throw new Error('Không tìm thấy sheet "Sheet1" trong file');
  // Range tường minh vì !ref của file này lỡ tràn tới cột XFA (do định dạng thừa), khiến
  // sheet_to_json không giới hạn range sẽ quét cực chậm/không cần thiết.
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, range: "A1:AG50000" });

  const out: ParsedRow[] = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const poCode = toStr(r?.[3]);
    if (!poCode) continue;

    out.push({
      nvkdCodeRaw: toStr(r[0]),
      customerCode: toStr(r[1]),
      poMonthLabel: toStr(r[2]),
      poCode,
      itemCode: toStr(r[4]),
      itemName: toStr(r[5]),
      invoiceName: toStr(r[6]),
      customerItemCode: toStr(r[7]),
      monthLabel: toStr(r[8]),
      poDate: toDate(r[9]),
      poQuantity: toNum(r[10]),
      unit: toStr(r[11]),
      actualPrice: toNum(r[12]),
      contractPrice: toNum(r[13]),
      requestedDeliveryDate: toDate(r[14]),
      note: toStr(r[15]),
      statusRaw: toStr(r[28]),
      delivery1: parseDeliverySlot(r[17], r[18], r[19]),
      delivery2: parseDeliverySlot(r[20], r[21], r[22]),
      delivery3: parseDeliverySlot(r[23], r[24], r[25]),
      totalDeliveredQty: toNum(r[26]),
      remainingQty: toNum(r[27]),
      poValue: toNum(r[29]) ?? 0,
      deliveredValue: toNum(r[30]) ?? 0,
      remainingValue: toNum(r[31]) ?? 0,
      content: toStr(r[32]),
    });
  }
  return out;
}

async function main() {
  const runner = await prisma.user.findUnique({ where: { email: runByEmail } });
  if (!runner) {
    console.error(`Không tìm thấy tài khoản với email "${runByEmail}"`);
    process.exit(1);
  }

  const rows = readExcel();
  console.log(`Đọc được ${rows.length} dòng có Số PO từ file.`);

  // Khoá tự nhiên = Số PO + Mã hàng/Tên SP + số thứ tự xuất hiện trong PO đó — tính theo THỨ
  // TỰ TRONG FILE (giả định anh không đảo thứ tự dòng của 1 PO giữa các lần gửi, chỉ thêm/sửa).
  const occurrence = new Map<string, number>();
  function naturalKeyOf(r: ParsedRow): string {
    const itemKey = r.itemCode ?? r.itemName ?? "?";
    const base = `${r.poCode}::${itemKey}`;
    const n = (occurrence.get(base) ?? 0) + 1;
    occurrence.set(base, n);
    return `${base}::${n}`;
  }

  // Nhân viên đã biết — map theo amisEmployeeCode có sẵn.
  const knownEmployees = await prisma.user.findMany({
    where: { amisEmployeeCode: { in: Object.values(NVKD_TO_AMIS_CODE) } },
    select: { id: true, amisEmployeeCode: true },
  });
  const employeeByAmisCode = new Map(knownEmployees.map((e) => [e.amisEmployeeCode as string, e.id]));

  // Load toàn bộ naturalKey đã có sẵn trong DB để phân biệt tạo mới/cập nhật mà không cần
  // 1 query riêng cho từng dòng.
  const existing = await prisma.poTrackingLine.findMany({ select: { id: true, naturalKey: true, manuallyClosed: true } });
  const existingByKey = new Map(existing.map((e) => [e.naturalKey, e.id]));
  // Cờ "Kết thúc đơn" bấm tay ở trang Tiến độ giao hàng KHÔNG được để file này ghi đè/mở lại —
  // phải đọc lại đúng giá trị hiện có của từng dòng đã tồn tại để giữ nguyên khi tính lại
  // statusRaw (xem computeLineDeliveryFields).
  const manuallyClosedById = new Map(existing.map((e) => [e.id, e.manuallyClosed]));

  // Tổng đợt giao do Phiếu đi hàng sinh ra của từng dòng (nếu có) — 1 query duy nhất, để cộng
  // vào baseline đọc từ file này mà không mất phần đã giao qua Phiếu đi hàng (xem
  // lib po-delivery-sync.ts trong @hoanggia/db).
  const slipAggByLine = await getSlipAggForAllLines();

  let created = 0;
  let updated = 0;
  let errorCount = 0;
  const errors: string[] = [];

  const batch = !dryRun
    ? await prisma.poTrackingImportBatch.create({
        data: {
          fileName: path.basename(EXCEL_PATH),
          totalRows: rows.length,
          createdCount: 0,
          updatedCount: 0,
          errorCount: 0,
          createdById: runner.id,
        },
      })
    : null;

  for (const r of rows) {
    try {
      const naturalKey = naturalKeyOf(r);
      const nvkdNorm = r.nvkdCodeRaw?.trim().toUpperCase() ?? null;
      const amisCode = nvkdNorm ? NVKD_TO_AMIS_CODE[nvkdNorm] : undefined;
      const salesEmployeeId = amisCode ? employeeByAmisCode.get(amisCode) ?? null : null;

      const existingId = existingByKey.get(naturalKey);
      // "Nền" = đúng nguyên giá trị các cột giao hàng trong file này — CỘNG THÊM phần đã giao
      // qua Phiếu đi hàng (nếu dòng đã tồn tại và có) để không bị mất khi file này ghi đè nền.
      const slipAgg = existingId ? slipAggByLine.get(existingId) ?? { qty: 0, value: 0 } : { qty: 0, value: 0 };
      // Đóng ("Kết thúc") nếu cột Trạng thái báo vậy, HOẶC cột Nội Dung nhắc huỷ/kết thúc — cả
      // 2 đều là tín hiệu từ chính file gốc rằng PO không cần giao tiếp (xem
      // contentIndicatesNoLongerNeeded).
      const baselineClosed =
        normPoStatus(r.statusRaw) === PO_CLOSED_STATUS || contentIndicatesNoLongerNeeded(r.content);
      const computed = computeLineDeliveryFields(
        {
          poValue: r.poValue,
          poQuantity: r.poQuantity,
          baselineDeliveredValue: r.deliveredValue,
          baselineDeliveredQty: r.totalDeliveredQty,
          baselineClosed,
          manuallyClosed: existingId ? manuallyClosedById.get(existingId) ?? false : false,
        },
        slipAgg
      );

      const data = {
        nvkdCodeRaw: nvkdNorm,
        salesEmployeeId,
        customerCode: r.customerCode,
        poMonthLabel: r.poMonthLabel,
        poCode: r.poCode,
        itemCode: r.itemCode,
        itemName: r.itemName,
        invoiceName: r.invoiceName,
        customerItemCode: r.customerItemCode,
        monthLabel: r.monthLabel,
        poDate: r.poDate,
        poQuantity: r.poQuantity,
        unit: r.unit,
        actualPrice: r.actualPrice,
        contractPrice: r.contractPrice,
        requestedDeliveryDate: r.requestedDeliveryDate,
        note: r.note,
        poValue: r.poValue,
        content: r.content,
        importBatchId: batch?.id,
        baselineDeliveredValue: r.deliveredValue,
        baselineDeliveredQty: r.totalDeliveredQty,
        baselineClosed,
        ...computed,
      };

      if (dryRun) {
        if (existingByKey.has(naturalKey)) updated++;
        else created++;
        continue;
      }

      const line = existingId
        ? await prisma.poTrackingLine.update({ where: { id: existingId }, data })
        : await prisma.poTrackingLine.create({ data: { ...data, naturalKey } });

      if (existingId) updated++;
      else created++;

      // Mỗi lần import là 1 bản snapshot đầy đủ CỦA RIÊNG FILE NÀY cho dòng PO này — xoá hết
      // event do CHÍNH FILE PO TRACKING sinh ra (sequence 1/2/3, sourceShipmentSlipId = null)
      // rồi ghi lại theo dữ liệu hiện tại — KHÔNG đụng tới các đợt giao do Phiếu đi hàng sinh
      // ra (sourceShipmentSlipId khác null), tránh xoá nhầm dữ liệu giao hàng mới hơn.
      await prisma.poDeliveryEvent.deleteMany({ where: { lineId: line.id, sourceShipmentSlipId: null } });
      const slots: [ParsedRow["delivery1"], number][] = [
        [r.delivery1, 1],
        [r.delivery2, 2],
        [r.delivery3, 3],
      ];
      for (const [slot, seq] of slots) {
        if (!slot) continue;
        await prisma.poDeliveryEvent.create({
          data: {
            lineId: line.id,
            salesEmployeeId,
            eventDate: slot.date,
            quantity: slot.qty,
            value: slot.value,
            sequence: seq,
          },
        });
      }
    } catch (e) {
      errorCount++;
      errors.push(`${r.poCode} / ${r.itemCode ?? r.itemName ?? "?"}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (batch) {
    await prisma.poTrackingImportBatch.update({
      where: { id: batch.id },
      data: { createdCount: created, updatedCount: updated, errorCount, errorReport: errors.length ? errors : undefined },
    });
  }

  console.log(`\n=== ${dryRun ? "DRY RUN (chưa ghi DB)" : "ĐÃ GHI DB"} ===`);
  console.log(`Tạo mới: ${created}`);
  console.log(`Cập nhật: ${updated}`);
  console.log(`Lỗi: ${errorCount}`);
  if (errors.length) {
    console.log("\nChi tiết lỗi (tối đa 20 dòng đầu):");
    errors.slice(0, 20).forEach((e) => console.log("  -", e));
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
