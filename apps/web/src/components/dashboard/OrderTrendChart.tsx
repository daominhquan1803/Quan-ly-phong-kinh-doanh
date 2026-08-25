"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrencyVND } from "@/lib/utils";
import { EmployeeFilterSelect } from "@/components/shared/EmployeeFilterSelect";
import { TrendingUp } from "lucide-react";
import { CHART_GRID_STROKE, CHART_TICK, CHART_TOOLTIP_STYLE, LEGEND_STYLE } from "./chart-theme";

interface MonthMeta {
  year: number;
  month: number;
  label: string;
  isCurrent: boolean;
}

interface TrendResponse {
  months: MonthMeta[];
  todayDate: number;
  days: Record<string, number | null>[]; // { day: number, [monthLabel]: value | null }
}

const COMPARE_OPTIONS = [
  { value: 0, label: "Không so sánh" },
  { value: 1, label: "So sánh 1 tháng trước" },
  { value: 2, label: "So sánh 2 tháng trước" },
  { value: 3, label: "So sánh 3 tháng trước" },
];

// Tháng hiện tại luôn nổi bật màu đỏ thương hiệu; các tháng so sánh trước đó dùng navy/xanh
// dương/vàng theo đúng thứ tự bảng màu đã thống nhất (navy → đỏ → xanh dương → vàng).
const PREV_MONTH_COLORS = ["#E0A327", "#5B8DEF", "#D4A017"];
const CURRENT_MONTH_COLOR = "#C8102E";

export function OrderTrendChart({ isAdmin }: { isAdmin: boolean }) {
  const [employeeId, setEmployeeId] = useState("");
  const [compareMonths, setCompareMonths] = useState(2);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-order-trend", employeeId, compareMonths],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeId) params.set("employeeId", employeeId);
      params.set("compareMonths", String(compareMonths));
      const res = await fetch(`/api/dashboard/order-trend?${params.toString()}`);
      if (!res.ok) throw new Error("Không tải được biểu đồ lên đơn");
      return res.json() as Promise<TrendResponse>;
    },
  });

  const months = data?.months ?? [];
  const colorForMonth = (m: MonthMeta, idx: number) =>
    m.isCurrent ? CURRENT_MONTH_COLOR : PREV_MONTH_COLORS[idx % PREV_MONTH_COLORS.length];

  return (
    <div className="rounded-lg border border-gray-200 bg-card p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-ink" />
          <h2 className="font-medium text-ink">Tình hình lên đơn hàng trong tháng</h2>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && <EmployeeFilterSelect value={employeeId} onChange={setEmployeeId} />}
          <select
            value={compareMonths}
            onChange={(e) => setCompareMonths(Number(e.target.value))}
            className="text-sm bg-card text-ink rounded-md border border-gray-200 py-2 px-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {COMPARE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted2 mb-4">
        Giá trị PO đặt hàng luỹ kế theo ngày trong tháng (theo ngày đặt PO) — đường tháng hiện tại dừng đúng ở hôm nay.
      </p>
      {isLoading && <p className="text-sm text-muted-foreground py-16 text-center">Đang tải...</p>}
      {!isLoading && data && (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data.days} margin={{ top: 5, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ ...CHART_TICK, fontSize: 12 }}
              label={{ value: "Ngày trong tháng", position: "insideBottom", offset: -4, fontSize: 11, fill: "#5b6478" }}
            />
            <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}tr`} tick={{ ...CHART_TICK, fontSize: 12 }} width={48} />
            <Tooltip formatter={(v: number) => formatCurrencyVND(v)} labelFormatter={(d) => `Ngày ${d}`} contentStyle={CHART_TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <ReferenceLine
              x={data.todayDate}
              stroke="#5b6478"
              strokeDasharray="4 4"
              label={{ value: "Hôm nay", fontSize: 10, fill: "#5b6478", position: "top" }}
            />
            {months.map((m, idx) => (
              <Line
                key={m.label}
                type="monotone"
                dataKey={m.label}
                stroke={colorForMonth(m, idx)}
                strokeWidth={m.isCurrent ? 3 : 1.75}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
