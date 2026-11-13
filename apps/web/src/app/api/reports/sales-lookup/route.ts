import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getSalesDetail, getSalesLookup, type StatsScope } from "@/lib/stats-data";
import { buildSalesLookupWorkbook, fmtDMY } from "@/lib/stats-workbook";
import { STATS_FROM, vnParts } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;
const querySchema = z.object({
  by: z.enum(["customer", "item"]).default("customer"),
  from: z.string().regex(monthRe).optional(),
  to: z.string().regex(monthRe).optional(),
  employeeId: z.string().trim().max(60).optional(),
  format: z.enum(["json", "xlsx"]).default("json"),
  // Chi tiết 1 ô: bấm vào số của khách/mã hàng trong 1 tháng.
  detail: z.enum(["1"]).optional(),
  key: z.string().trim().max(200).optional(),
  month: z.string().regex(monthRe).optional(),
  metric: z.enum(["order", "delivered"]).optional(),
});

const ym = (d: Date) => {
  const p = vnParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}`;
};

/**
 * GET /api/reports/sales-lookup — Báo cáo > Doanh số khách / mã hàng. Doanh số đơn hàng theo ngày PO, doanh số đi hàng theo ngày giao,
 * từ đầu năm 2026 đến tháng hiện tại. NVKD chỉ thấy khách của mình; ADMIN thấy tất cả và lọc được theo employeeId.
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
    const minMonth = ym(STATS_FROM);
    const maxMonth = ym(ref);
    const clamp = (m: string) => (m < minMonth ? minMonth : m > maxMonth ? maxMonth : m);

    if (q.detail) {
      if (!q.key || !q.month || !q.metric) return NextResponse.json({ error: "Thiếu tham số chi tiết" }, { status: 400 });
      const rows = await getSalesDetail(scope, { by: q.by, key: q.key, month: clamp(q.month), metric: q.metric });
      return NextResponse.json({ rows });
    }

    const from = clamp(q.from ?? minMonth);
    const to = clamp(q.to ?? maxMonth);
    const { months, rows } = await getSalesLookup(scope, { by: q.by, from, to });

    if (q.format === "xlsx") {
      const rangeLabel = `Từ tháng ${from.slice(5)}/${from.slice(0, 4)} đến tháng ${to.slice(5)}/${to.slice(0, 4)}`;
      const wb = await buildSalesLookupWorkbook(q.by, months, rows, rangeLabel, ref);
      const today = fmtDMY(ref).split("/").reverse().join("-");
      const fileName = `Doanh-so-${q.by === "customer" ? "khach-hang" : "ma-hang"}_${from}_${to}_${today}.xlsx`;
      return new NextResponse(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        },
      });
    }
    return NextResponse.json({ months, rows, minMonth, maxMonth });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("reports/sales-lookup GET error", err);
    return NextResponse.json({ error: "Không lập được thống kê doanh số" }, { status: 500 });
  }
}
