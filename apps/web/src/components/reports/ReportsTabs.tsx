"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ReportsPanel } from "./ReportsPanel";
import { StatsPanel } from "./StatsPanel";
import { CustomerReportPanel } from "@/components/customer-report/CustomerReportPanel";

type Tab = "period" | "stats" | "customers";

/** Trang Báo cáo có 2 khu: báo cáo tuần/tháng (dashboard) và Thống kê (khách/mã hàng lâu chưa mua, hoá đơn theo khách). */
export function ReportsTabs({ isAdmin, isSystem }: { isAdmin: boolean; isSystem: boolean }) {
  const [tab, setTab] = useState<Tab>("period");
  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-white/10 pb-3">
        {(
          [
            ["period", "Báo cáo tuần / tháng"],
            ["stats", "Thống kê"],
            ["customers", "Danh sách khách hàng"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition-all",
              tab === k ? "bg-white/10 text-white" : "text-muted2 hover:bg-white/[0.05] hover:text-ink"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "period" ? <ReportsPanel /> : tab === "stats" ? <StatsPanel isAdmin={isAdmin} /> : <CustomerReportPanel isAdmin={isAdmin} canFixGroups={isSystem} />}
    </div>
  );
}
