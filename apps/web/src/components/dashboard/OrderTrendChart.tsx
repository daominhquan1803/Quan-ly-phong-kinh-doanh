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
import { TrendingUp, Activity } from "lucide-react";
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

const PREV_MONTH_COLORS = ["#E0A327", "#5B8DEF", "#22B378"];
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
    <div className="rounded-2xl border border-gray-200/80 bg-navy-900/60 p-6 shadow-card backdrop-blur-xl transition-all">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(224,163,39,0.15)]">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold text-ink text-base">Tình hình lên đơn hàng trong tháng</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Theo dõi giá trị PO đặt hàng theo từng ngày thực tế
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isAdmin && <EmployeeFilterSelect value={employeeId} onChange={setEmployeeId} />}
          <select
            value={compareMonths}
            onChange={(e) => setCompareMonths(Number(e.target.value))}
            className="text-xs bg-navy-50/80 text-ink rounded-xl border border-gray-200/90 py-2 px-3 focus:outline-none focus:border-amber-500"
          >
            {COMPARE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-muted2/80 mb-5">
        Giá trị PO đặt hàng theo TỪNG NGÀY trong tháng (không cộng dồn, theo ngày đặt PO) — đường tháng hiện tại dừng đúng ở hôm nay.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground py-16 text-center">Đang tải biểu đồ...</p>}

      {!isLoading && data && (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data.days} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ ...CHART_TICK, fontSize: 12 }}
              label={{ value: "Ngày trong tháng", position: "insideBottom", offset: -4, fontSize: 11, fill: "rgb(var(--c-gray-400))" }}
            />
            <YAxis
              tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}tr`}
              tick={{ ...CHART_TICK, fontSize: 12 }}
              width={52}
            />
            <Tooltip
              formatter={(v: number) => formatCurrencyVND(v)}
              labelFormatter={(d) => `Ngày ${d}`}
              contentStyle={CHART_TOOLTIP_STYLE}
            />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <ReferenceLine
              x={data.todayDate}
              stroke="rgb(var(--c-gray-400))"
              strokeDasharray="4 4"
              label={{ value: "Hôm nay", fontSize: 10, fill: "#E0A327", position: "top" }}
            />
            {months.map((m, idx) => (
              <Line
                key={m.label}
                type="monotone"
                dataKey={m.label}
                stroke={colorForMonth(m, idx)}
                strokeWidth={m.isCurrent ? 3 : 1.75}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "rgb(var(--c-ink))" }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
