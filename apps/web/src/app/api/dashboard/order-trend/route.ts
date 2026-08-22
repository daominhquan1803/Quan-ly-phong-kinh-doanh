import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const MAX_COMPARE_MONTHS = 3;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Biểu đồ "Tình hình lên đơn hàng trong tháng" ở Tổng quan — giá trị PO đặt hàng LUỸ KẾ theo
 * ngày trong tháng (cùng số đo "Giá trị PO đặt hàng" đã dùng ở Kế hoạch kinh doanh — theo ngày
 * đặt PO, PoTrackingLine.poDate), so sánh tháng hiện tại với tối đa 3 tháng trước đó trên cùng
 * 1 trục ngày (ngày 1..N) để thấy nhịp độ lên đơn nhanh/chậm hơn tháng trước ở đúng cùng thời
 * điểm trong tháng. Tháng hiện tại CHỈ luỹ kế tới hôm nay (không suy đoán phần chưa tới), các
 * tháng trước luỹ kế trọn tháng.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const employeeIdParam = req.nextUrl.searchParams.get("employeeId");
    const compareMonthsRaw = Number(req.nextUrl.searchParams.get("compareMonths") ?? "2");
    const compareMonths = Math.min(MAX_COMPARE_MONTHS, Math.max(0, Number.isFinite(compareMonthsRaw) ? compareMonthsRaw : 2));

    const scope = scopeByOwner(session, "salesEmployeeId");
    const employeeWhere = {
      ...scope,
      // Chỉ ADMIN được lọc theo nhân viên bất kỳ — SALES đã bị scopeByOwner giới hạn.
      ...(employeeIdParam && session.user.role === "ADMIN" ? { salesEmployeeId: employeeIdParam } : {}),
    };

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth() + 1;
    const todayDate = now.getDate();

    // Danh sách tháng cần vẽ: từ (compareMonths tháng trước) tới tháng hiện tại, CŨ → MỚI —
    // tháng cuối cùng luôn là tháng hiện tại.
    const months: { year: number; month: number }[] = [];
    for (let i = compareMonths; i >= 0; i--) {
      let y = todayYear;
      let m = todayMonth - i;
      while (m < 1) {
        m += 12;
        y -= 1;
      }
      months.push({ year: y, month: m });
    }

    // 1 query duy nhất cho toàn bộ khoảng ngày cần — tránh N query riêng theo từng tháng.
    const earliestStart = new Date(months[0].year, months[0].month - 1, 1);
    const latestEnd = new Date(todayYear, todayMonth, 1);
    const lines = await prisma.poTrackingLine.findMany({
      where: { poDate: { gte: earliestStart, lt: latestEnd }, salesEmployeeId: { not: null }, ...employeeWhere },
      select: { poDate: true, poValue: true },
    });

    // Gộp theo đúng (năm, tháng, ngày) đặt PO -> tổng giá trị PO đặt trong ngày đó.
    const dailyMap = new Map<string, number>();
    for (const l of lines) {
      if (!l.poDate) continue;
      const key = `${l.poDate.getFullYear()}-${l.poDate.getMonth() + 1}-${l.poDate.getDate()}`;
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + Number(l.poValue));
    }

    const monthLabels = months.map((m) => `Tháng ${m.month}/${m.year}`);
    const maxDays = Math.max(...months.map((m) => daysInMonth(m.year, m.month)));

    const days: Record<string, number | null>[] = [];
    const runningTotals = months.map(() => 0);
    for (let day = 1; day <= maxDays; day++) {
      const row: Record<string, number | null> = { day };
      months.forEach((m, idx) => {
        const isCurrentMonth = m.year === todayYear && m.month === todayMonth;
        const beyondMonth = day > daysInMonth(m.year, m.month);
        const beyondToday = isCurrentMonth && day > todayDate;
        if (beyondMonth || beyondToday) {
          row[monthLabels[idx]] = null; // hết tháng, hoặc tháng hiện tại chưa tới ngày đó
        } else {
          const key = `${m.year}-${m.month}-${day}`;
          runningTotals[idx] += dailyMap.get(key) ?? 0;
          row[monthLabels[idx]] = runningTotals[idx];
        }
      });
      days.push(row);
    }

    return NextResponse.json({
      months: months.map((m, idx) => ({
        year: m.year,
        month: m.month,
        label: monthLabels[idx],
        isCurrent: m.year === todayYear && m.month === todayMonth,
      })),
      todayDate,
      days,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("dashboard/order-trend GET error", err);
    return NextResponse.json({ error: "Không tải được biểu đồ lên đơn" }, { status: 500 });
  }
}
