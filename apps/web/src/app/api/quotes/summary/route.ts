import { NextRequest, NextResponse } from "next/server";
import { prisma, QuoteStatus, QUOTE_STATUS_LABEL } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Thứ tự hiển thị theo đúng cách anh liệt kê khi yêu cầu tính năng: chốt được giá, đang thương
// thảo, không bán được, chưa báo giá.
const STATUS_ORDER: QuoteStatus[] = [QuoteStatus.WON, QuoteStatus.NEGOTIATING, QuoteStatus.LOST, QuoteStatus.NOT_QUOTED];

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);

    // Danh sách tháng đang có dữ liệu (khớp đúng các sheet THÁNG đang tồn tại trong Google
    // Sheet nguồn) — dùng cho bộ chọn tháng trên UI, không phải danh sách 12 tháng cố định vì
    // không phải tháng nào cũng có sheet.
    const monthRows = await prisma.quoteRequest.findMany({
      distinct: ["year", "month"],
      select: { year: true, month: true },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    const availableMonths = monthRows.map((m) => ({ year: m.year, month: m.month, label: `Tháng ${m.month}/${m.year}` }));

    const yearParam = Number(searchParams.get("year"));
    const monthParam = Number(searchParams.get("month"));
    const target = yearParam && monthParam ? { year: yearParam, month: monthParam } : availableMonths[0] ?? null;

    if (!target) {
      return NextResponse.json({
        year: null,
        month: null,
        total: 0,
        byStatus: STATUS_ORDER.map((status) => ({ status, label: QUOTE_STATUS_LABEL[status], count: 0, pct: 0 })),
        byAssignee: [],
        availableMonths,
        lastSyncedAt: null,
      });
    }

    const where = { year: target.year, month: target.month };

    const [statusCounts, assigneeStatusCounts, latest] = await Promise.all([
      prisma.quoteRequest.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.quoteRequest.groupBy({ by: ["assigneeRaw", "status"], where, _count: { _all: true } }),
      prisma.quoteRequest.findFirst({ where, orderBy: { syncedAt: "desc" }, select: { syncedAt: true } }),
    ]);

    const total = statusCounts.reduce((s, r) => s + r._count._all, 0);
    const countByStatus = new Map(statusCounts.map((r) => [r.status, r._count._all]));
    const byStatus = STATUS_ORDER.map((status) => {
      const count = countByStatus.get(status) ?? 0;
      return { status, label: QUOTE_STATUS_LABEL[status], count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
    });

    // Gộp theo Phụ trách (giữ nguyên văn từ file, có thể null nếu ô trống trong sheet gốc).
    const assigneeMap = new Map<
      string,
      { assigneeRaw: string; total: number } & Record<QuoteStatus, number>
    >();
    for (const row of assigneeStatusCounts) {
      const key = row.assigneeRaw ?? "(Chưa ghi Phụ trách)";
      if (!assigneeMap.has(key)) {
        assigneeMap.set(key, {
          assigneeRaw: key,
          total: 0,
          [QuoteStatus.WON]: 0,
          [QuoteStatus.NEGOTIATING]: 0,
          [QuoteStatus.LOST]: 0,
          [QuoteStatus.NOT_QUOTED]: 0,
        });
      }
      const entry = assigneeMap.get(key)!;
      entry[row.status] += row._count._all;
      entry.total += row._count._all;
    }
    const byAssignee = Array.from(assigneeMap.values()).sort((a, b) => b.total - a.total);

    return NextResponse.json({
      year: target.year,
      month: target.month,
      total,
      byStatus,
      byAssignee,
      availableMonths,
      lastSyncedAt: latest?.syncedAt ?? null,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("quotes/summary GET error", err);
    return NextResponse.json({ error: "Không tải được thống kê báo giá" }, { status: 500 });
  }
}
