import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getDormantCustomers, getDormantItems, getInvoiceRows, type StatsScope } from "@/lib/stats-data";
import { buildDormantCustomersWorkbook, buildDormantItemsWorkbook, buildInvoiceWorkbook, fmtDMY } from "@/lib/stats-workbook";
import { BUCKET_LABEL, PAY_STATUS_LABEL, normCode, type DormantBucket } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const querySchema = z.object({
  kind: z.enum(["dormant-customers", "dormant-items", "invoices"]),
  bucket: z.enum(["2", "3", "over3"]).optional(),
  customer: z.string().trim().max(100).optional(),
  month: z.string().regex(/^(ALL|\d{4}-(0[1-9]|1[0-2]))$/).optional(),
  employeeId: z.string().trim().max(60).optional(),
  format: z.enum(["json", "xlsx"]).default("json"),
});

const FILE_KIND: Record<string, string> = {
  "dormant-customers": "Khach-lau-chua-mua",
  "dormant-items": "Ma-hang-lau-chua-mua",
  invoices: "Hoa-don-theo-khach",
};

/**
 * GET /api/reports/stats — trang Báo cáo > Thống kê. `format=json` trả số lượng + vài dòng xem trước; `format=xlsx` tải file Excel.
 * NVKD chỉ thấy khách/hoá đơn của mình; ADMIN thấy tất cả và lọc được theo employeeId.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Tham số không hợp lệ" }, { status: 400 });
    const q = parsed.data;
    const isAdmin = session.user.role === "ADMIN";
    const scope: StatsScope = { isAdmin, userId: session.user.id, employeeId: isAdmin ? q.employeeId || undefined : undefined };
    const ref = new Date();
    const today = fmtDMY(ref).split("/").reverse().join("-");

    if (q.kind === "invoices") {
      const customer = !q.customer || q.customer === "ALL" ? "ALL" : normCode(q.customer);
      const month = q.month ?? "ALL";
      const rows = await getInvoiceRows(scope, { customer, month });
      const totals = {
        total: rows.reduce((s, r) => s + r.total, 0),
        paid: rows.reduce((s, r) => s + r.paid, 0),
        remaining: rows.reduce((s, r) => s + r.remaining, 0),
      };
      if (q.format === "xlsx") {
        const customerLabel = customer === "ALL" ? (isAdmin && !scope.employeeId ? "Tất cả khách hàng" : "Tất cả khách hàng của bạn") : rows[0] ? `${rows[0].customerName} (${rows[0].customerCode})` : customer;
        const monthLabel = month === "ALL" ? "Toàn bộ thời gian" : `Tháng ${month.slice(5)}/${month.slice(0, 4)}`;
        const wb = await buildInvoiceWorkbook(rows, customerLabel, monthLabel, ref);
        return xlsx(await wb.xlsx.writeBuffer(), `${FILE_KIND.invoices}_${customer === "ALL" ? "tat-ca" : customer.replace(/[^A-Za-z0-9]+/g, "-")}_${month}_${today}.xlsx`);
      }
      return NextResponse.json({
        kind: q.kind,
        count: rows.length,
        totals,
        counts: { paid: rows.filter((r) => r.status === "PAID").length, partial: rows.filter((r) => r.status === "PARTIAL").length, unpaid: rows.filter((r) => r.status === "UNPAID").length },
        sample: rows.slice(0, 8).map((r) => ({ invoiceNumber: r.invoiceNumber, invoiceDate: r.invoiceDate, customerName: r.customerName, total: r.total, remaining: r.remaining, status: PAY_STATUS_LABEL[r.status] })),
      });
    }

    const bucket = (q.bucket ?? "2") as DormantBucket;
    if (q.kind === "dormant-customers") {
      const rows = await getDormantCustomers(scope, bucket, ref);
      if (q.format === "xlsx") {
        const wb = await buildDormantCustomersWorkbook(rows, bucket, ref);
        return xlsx(await wb.xlsx.writeBuffer(), `${FILE_KIND[q.kind]}_${bucket}-thang_${today}.xlsx`);
      }
      return NextResponse.json({
        kind: q.kind,
        count: rows.length,
        bucketLabel: BUCKET_LABEL[bucket],
        sample: rows.slice(0, 8).map((r) => ({ code: r.code, name: r.name, ownerName: r.ownerName, lastPoDate: r.lastPoDate, monthsSince: r.monthsSince, historyValue: r.historyValue })),
      });
    }

    const rows = await getDormantItems(scope, bucket, ref);
    if (q.format === "xlsx") {
      const wb = await buildDormantItemsWorkbook(rows, bucket, ref);
      return xlsx(await wb.xlsx.writeBuffer(), `${FILE_KIND[q.kind]}_${bucket}-thang_${today}.xlsx`);
    }
    return NextResponse.json({
      kind: q.kind,
      count: rows.length,
      bucketLabel: BUCKET_LABEL[bucket],
      customers: new Set(rows.map((r) => r.customerNorm)).size,
      sample: rows.slice(0, 8).map((r) => ({ customerName: r.name, itemCode: r.itemCode, itemName: r.itemName, lastPoDate: r.lastPoDate, monthsSince: r.monthsSince })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("reports/stats GET error", err);
    return NextResponse.json({ error: "Không lập được thống kê" }, { status: 500 });
  }
}

function xlsx(buffer: ArrayBuffer | Buffer | Uint8Array, fileName: string) {
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
