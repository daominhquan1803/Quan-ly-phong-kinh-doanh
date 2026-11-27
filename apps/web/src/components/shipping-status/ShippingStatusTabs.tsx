"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ShippingStatusOverview } from "./ShippingStatusOverview";
import { ProductionProgress } from "./ProductionProgress";

type Tab = "delivery" | "production";

/** Trang Tiến độ giao hàng: tình hình giao hàng và tiến độ sản xuất của hàng còn nợ. */
export function ShippingStatusTabs({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<Tab>("delivery");
  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-white/10 pb-3">
        {(
          [
            ["delivery", "Tình hình giao hàng"],
            ["production", "Tiến độ hàng hoá"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn("rounded-xl px-4 py-2 text-sm font-semibold transition-all", tab === k ? "bg-white/10 text-white" : "text-muted2 hover:bg-white/[0.05] hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "delivery" ? <ShippingStatusOverview isAdmin={isAdmin} /> : <ProductionProgress isAdmin={isAdmin} />}
    </div>
  );
}
