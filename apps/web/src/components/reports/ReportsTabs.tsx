"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { UxTabs } from "@/components/ux/UxTabs";
import { ReportsPanel } from "./ReportsPanel";
import { StatsPanel } from "./StatsPanel";
import { SalesLookupPanel } from "./SalesLookupPanel";

type Tab = "period" | "stats" | "sales";

/**
 * Trang Báo cáo có 3 khu: báo cáo tuần/tháng (dashboard), Thống kê (khách/mã hàng lâu chưa mua, hoá đơn theo khách) và
 * Doanh số khách / mã hàng theo tháng. Mở thẳng tab doanh số bằng /reports?tab=sales&by=customer|item&q=<mã hoặc tên>.
 */
export function ReportsTabs({ isAdmin }: { isAdmin: boolean }) {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get("tab") === "sales" ? "sales" : "period");
  const initialBy = params.get("by") === "item" ? "item" : "customer";
  return (
    <div className="space-y-5">
      <UxTabs<Tab> label="Khu báo cáo" value={tab} onChange={setTab} tabs={[["period", "Báo cáo tuần / tháng"], ["stats", "Thống kê"], ["sales", "Doanh số khách / mã hàng"]]} />
      {tab === "period" && <ReportsPanel />}
      {tab === "stats" && <StatsPanel isAdmin={isAdmin} />}
      {tab === "sales" && <SalesLookupPanel isAdmin={isAdmin} initialBy={initialBy} initialQuery={params.get("q") ?? ""} />}
    </div>
  );
}
