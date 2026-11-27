"use client";

import { useState } from "react";
import { UxTabs } from "@/components/ux/UxTabs";
import { ShippingStatusOverview } from "./ShippingStatusOverview";
import { ProductionProgress } from "./ProductionProgress";

type Tab = "delivery" | "production";

/** Trang Tiến độ giao hàng: tình hình giao hàng và tiến độ sản xuất của hàng còn nợ. */
export function ShippingStatusTabs({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<Tab>("delivery");
  return (
    <div className="space-y-5">
      <UxTabs<Tab> label="Khu tiến độ giao hàng" value={tab} onChange={setTab} tabs={[["delivery", "Tình hình giao hàng"], ["production", "Tiến độ hàng hoá"]]} />
      {tab === "delivery" ? <ShippingStatusOverview isAdmin={isAdmin} /> : <ProductionProgress isAdmin={isAdmin} />}
    </div>
  );
}
