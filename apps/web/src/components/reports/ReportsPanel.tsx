"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { isoWeekString } from "@/lib/report-period";

type ReportKind = "month" | "week";

function currentPeriod(kind: ReportKind): string {
  const now = new Date();
  return kind === "month" ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` : isoWeekString(now);
}

export function ReportsPanel() {
  const [kind, setKind] = useState<ReportKind>("month");
  const [periods, setPeriods] = useState<Record<ReportKind, string>>(() => ({ month: currentPeriod("month"), week: currentPeriod("week") }));
  const period = periods[kind];
  const compare = kind === "month" ? "2 tháng trước" : "2 tuần trước (Thứ 2 – Chủ nhật)";

  return (
    <div className="glass-card border border-white/10 p-5 space-y-5 max-w-2xl">
      <div className="flex gap-2">
        {(["month", "week"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${
              kind === k ? "border-amber-500/60 bg-amber-500/15 text-amber-300" : "border-white/10 bg-white/[0.03] text-ink hover:bg-white/[0.08]"
            }`}
          >
            {k === "month" ? "Báo cáo tháng" : "Báo cáo tuần"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted2">{kind === "month" ? "Chọn tháng" : "Chọn tuần"}</label>
        <input
          type={kind === "month" ? "month" : "week"}
          value={period}
          onChange={(e) => e.target.value && setPeriods((p) => ({ ...p, [kind]: e.target.value }))}
          className="text-sm bg-card text-ink rounded-xl border border-white/10 py-2 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
        />
        <a
          href={`/api/reports/export?type=${kind}&period=${encodeURIComponent(period)}`}
          className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-amber-foreground hover:bg-amber-400 transition-all"
        >
          <Download className="h-4 w-4" />
          Tải báo cáo Excel
        </a>
      </div>

      <ul className="text-xs text-muted2 space-y-1 list-disc pl-5">
        <li>Doanh số đơn hàng, đi hàng, đơn hàng sản xuất, đi hàng sản xuất — so sánh với {compare}.</li>
        <li>OIH, khách hàng mới, công nợ (chốt cuối kỳ), kế hoạch thu, hoá đơn quá hạn.</li>
        <li>Sheet Dashboard có ô chọn nhân viên và chỉ số; sheet Dữ liệu lọc được. Mở file bằng Excel để dùng ô chọn.</li>
        <li>Quản trị viên xem cả phòng và từng nhân viên; NVKD chỉ thấy số của mình.</li>
      </ul>
    </div>
  );
}
