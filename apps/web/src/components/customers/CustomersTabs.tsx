"use client";

import { useState } from "react";
import { UxTabs } from "@/components/ux/UxTabs";
import { CustomersPanel } from "./CustomersPanel";
import { CustomerReportPanel } from "@/components/customer-report/CustomerReportPanel";

type Tab = "list" | "profiles";

/** Trang Khách hàng có 2 khu: danh sách khách (phân công NVKD, hạn nợ, email) và Hồ sơ khách hàng (ngành, đang mua gì, tiến trình, tình trạng). */
export function CustomersTabs({ isAdmin, isSystem }: { isAdmin: boolean; isSystem: boolean }) {
  const [tab, setTab] = useState<Tab>("list");
  return (
    <div className="space-y-5">
      <UxTabs<Tab> label="Khu khách hàng" value={tab} onChange={setTab} tabs={[["list", "Danh sách"], ["profiles", "Hồ sơ khách hàng"]]} />
      {tab === "list" ? <CustomersPanel isAdmin={isAdmin} canManage={isSystem} /> : <CustomerReportPanel isAdmin={isAdmin} canFixGroups={isSystem} />}
    </div>
  );
}
