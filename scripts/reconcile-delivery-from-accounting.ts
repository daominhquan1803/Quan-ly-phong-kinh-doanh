/**
 * Đối chiếu "Sổ chi tiết bán hàng" xuất từ AMIS Kế toán với dữ liệu đơn hàng đang có trong hệ
 * thống — phát hiện đơn đã thực sự bán/giao (có hoá đơn thật) nhưng AMIS CRM báo sai (lỗi
 * đồng bộ nội bộ AMIS, đã xác nhận với anh Quân 20/08/2026): hoàn toàn chưa có trên CRM, hoặc
 * CRM còn báo "Giao 1 phần" dù hoá đơn đã xuất gần đủ giá trị đơn.
 *
 * Đơn được sửa/tạo qua script này được đánh dấu deliveryVerifiedManually=true — worker sync
 * AMIS CRM (apps/worker/src/sync/amis.ts) sẽ bỏ qua hoàn toàn các đơn này ở các lần đồng bộ
 * sau, tránh bị AMIS ghi đè lại về trạng thái sai.
 *
 * Cách chạy: npx tsx scripts/reconcile-delivery-from-accounting.ts <đường-dẫn-file.xlsx> [--dry-run]
 * File Excel phải có sheet "SỔ CHI TIẾT BÁN HÀNG" theo đúng cấu trúc cột chuẩn của AMIS Kế
 * toán (cột O = "Đơn hàng", chứa mã đơn khớp với orderCode trong hệ thống).
 */
import * as XLSX from "xlsx";
import { prisma } from "@hoanggia/db";
import path from "path";

const excelPathArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!excelPathArg) {
  console.error("Thiếu đường dẫn file Excel. Cách dùng: npx tsx scripts/reconcile-delivery-from-accounting.ts <file.xlsx> [--dry-run]");
  process.exit(1);
}
const EXCEL_PATH = path.resolve(excelPathArg);
const RECONCILE_NOTE_SUFFIX = `— đối chiếu Sổ chi tiết bán hàng kế toán (${path.basename(EXCEL_PATH)}) ngày ${new Date().toISOString().slice(0, 10)}, xác nhận lỗi đồng bộ nội bộ AMIS CRM.`;

const PREFIX_TO_AMIS_CODE: Record<string, string> = {
  DT: "DANGTAN",
  MQ: "MINHQUAN",
  NT: "THANHTUNG",
  PD: "PHAMDUNG",
  KH: "PHAMDUNG",
};

function snapDate(d: unknown): string | null {
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  const snapped = new Date(Math.round(d.getTime() / 86400000) * 86400000);
  return snapped.toISOString().slice(0, 10);
}

interface ExcelLine {
  orderCode: string;
  invoiceDate: string | null;
  voucherDate: string | null;
  itemCode: string | null;
  itemName: string | null;
  unit: string | null;
  qty: number;
  unitPrice: number;
  revenue: number;
  customerName: string | null;
}

function readExcel(): ExcelLine[] {
  const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });
  const ws = wb.Sheets["SỔ CHI TIẾT BÁN HÀNG"];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const out: ExcelLine[] = [];
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const orderCode = r[14] as string | null;
    if (!orderCode) continue;
    out.push({
      orderCode: String(orderCode).trim(),
      invoiceDate: snapDate(r[3]),
      voucherDate: snapDate(r[1]),
      itemCode: (r[7] as string) ?? null,
      itemName: (r[8] as string) ?? null,
      unit: (r[9] as string) ?? null,
      qty: typeof r[10] === "number" ? r[10] : 0,
      unitPrice: typeof r[11] === "number" ? r[11] : 0,
      revenue: typeof r[12] === "number" ? r[12] : 0,
      customerName: (r[6] as string) ?? null,
    });
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const lines = readExcel();
  const byOrder = new Map<string, ExcelLine[]>();
  for (const l of lines) {
    if (!byOrder.has(l.orderCode)) byOrder.set(l.orderCode, []);
    byOrder.get(l.orderCode)!.push(l);
  }

  const existingOrders = await prisma.order.findMany({
    where: { orderCode: { in: Array.from(byOrder.keys()) } },
    select: { id: true, orderCode: true, status: true, totalValue: true },
  });
  const existingByCode = new Map(existingOrders.map((o) => [o.orderCode, o]));

  const created: string[] = [];
  const skippedOutOfScope: string[] = [];
  const updatedPartial: string[] = [];

  for (const [orderCode, orderLines] of byOrder) {
    const maxInvoiceDate = orderLines.reduce<string | null>((max, l) => {
      const d = l.invoiceDate || l.voucherDate;
      return d && (!max || d > max) ? d : max;
    }, null);
    const totalRevenue = Math.round(orderLines.reduce((s, l) => s + l.revenue, 0));
    const existing = existingByCode.get(orderCode);

    if (!existing) {
      // Cùng quy tắc với worker/sync/amis.ts (ORDER_DATE_CUTOFF): đơn có mã tháng trước 04/2026
      // bị loại có chủ đích (AMIS không đáng tin với dữ liệu giao hàng trước mốc này) — không
      // tự tạo lại các đơn này dù kế toán đã ghi nhận.
      const codeMonth = parseInt(orderCode.slice(1, 3), 10);
      if (!Number.isFinite(codeMonth) || codeMonth < 4) {
        skippedOutOfScope.push(`${orderCode} (mã tháng ${codeMonth || "?"} — trước mốc 04/2026, bị loại có chủ đích)`);
        continue;
      }
      const prefix = orderCode.length >= 8 ? orderCode.slice(6, 8) : "";
      const amisCode = PREFIX_TO_AMIS_CODE[prefix];
      if (!amisCode) {
        skippedOutOfScope.push(`${orderCode} (tiền tố "${prefix}" không thuộc 4 NVKD quản lý)`);
        continue;
      }
      const employee = await prisma.user.findUnique({ where: { amisEmployeeCode: amisCode } });
      if (!employee) {
        skippedOutOfScope.push(`${orderCode} (không tìm thấy nhân viên mã ${amisCode})`);
        continue;
      }

      const customerName = orderLines.find((l) => l.customerName)?.customerName ?? "(Không rõ khách hàng)";

      if (!dryRun) {
        await prisma.order.create({
          data: {
            orderCode,
            source: "ACCOUNTING_RECONCILE",
            customerName,
            salesEmployeeId: employee.id,
            salesEmployeeNameRaw: employee.name,
            actualDeliveryDate: maxInvoiceDate ? new Date(maxInvoiceDate) : null,
            status: "DELIVERED",
            totalValue: totalRevenue,
            deliveredValue: totalRevenue,
            deliveryVerifiedManually: true,
            deliveryVerifiedNote: `Đơn hoàn toàn không tồn tại trên AMIS CRM dù đã có hoá đơn thật ${RECONCILE_NOTE_SUFFIX}`,
            items: {
              create: orderLines.map((l, idx) => ({
                lineOrder: idx,
                itemCode: l.itemCode,
                itemName: l.itemName || l.itemCode || "(Không rõ tên hàng)",
                unit: l.unit,
                quantity: l.qty,
                unitPrice: l.unitPrice,
                totalPrice: l.revenue,
              })),
            },
          },
        });
      }
      created.push(`${orderCode} — ${customerName} — ${totalRevenue.toLocaleString("vi-VN")}đ — NV ${employee.name}`);
      continue;
    }

    if (existing.status === "PARTIAL_DELIVERED" && totalRevenue >= Number(existing.totalValue) * 0.9) {
      const pct = Math.round((totalRevenue / Number(existing.totalValue)) * 100);
      if (!dryRun) {
        await prisma.order.update({
          where: { id: existing.id },
          data: {
            status: "DELIVERED",
            deliveredValue: existing.totalValue,
            actualDeliveryDate: maxInvoiceDate ? new Date(maxInvoiceDate) : undefined,
            deliveryVerifiedManually: true,
            deliveryVerifiedNote: `CRM báo "Giao 1 phần" nhưng kế toán đã xuất hoá đơn ${pct}% giá trị đơn ${RECONCILE_NOTE_SUFFIX}`,
          },
        });
      }
      updatedPartial.push(`${orderCode} — đã xuất HĐ ${pct}% — ${totalRevenue.toLocaleString("vi-VN")}đ`);
    }
  }

  console.log(`\n=== ${dryRun ? "DRY RUN (chưa ghi DB)" : "ĐÃ GHI DB"} ===`);
  console.log(`\nTạo mới (${created.length}):`);
  created.forEach((s) => console.log("  +", s));
  console.log(`\nBỏ qua vì ngoài phạm vi quản lý (${skippedOutOfScope.length}):`);
  skippedOutOfScope.forEach((s) => console.log("  -", s));
  console.log(`\nCập nhật "Giao 1 phần" -> "Đã giao" (${updatedPartial.length}):`);
  updatedPartial.forEach((s) => console.log("  ~", s));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
