"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CustomersPanel } from "./CustomersPanel";
import { CustomerReportPanel } from "@/components/customer-report/CustomerReportPanel";

type Tab = "list" | "profiles";

/** Trang Khách hàng có 2 khu: danh sách khách (phân công NVKD, hạn nợ, email) và Hồ sơ khách hàng (ngành, đang mua gì, tiến trình, tình trạng). */
export function CustomersTabs({ isAdmin, isSystem }: { isAdmin: boolean; isSystem: boolean }) {
  const [tab, setTab] = useState<Tab>("list");
  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-white/10 pb-3">
        {(
          [
            ["list", "Danh sách"],
            ["profiles", "Hồ sơ khách hàng"],
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
      {tab === "list" ? <CustomersPanel isAdmin={isAdmin} /> : <CustomerReportPanel isAdmin={isAdmin} canFixGroups={isSystem} />}
    </div>
  );
}
