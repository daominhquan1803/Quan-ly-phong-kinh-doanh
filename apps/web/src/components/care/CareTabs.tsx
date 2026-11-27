"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UxTabs } from "@/components/ux/UxTabs";
import { CarePanel } from "./CarePanel";
import { CareTeam } from "./CareTeam";

type Tab = "log" | "team";

/** Hai tab của trang Chăm sóc: ghi nhanh (NVKD dùng hằng ngày) và thống kê phòng (quản trị mặc định mở tab này). */
export function CareTabs({ defaultTab, canVerify }: { defaultTab: Tab; canVerify: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const customer = params.get("customer") ?? "";
  const [tab, setTab] = useState<Tab>(customer ? "log" : defaultTab);

  function openCustomer(id: string) {
    router.push(`/cham-soc?customer=${id}`);
    setTab("log");
  }

  return (
    <div className="space-y-6">
      <UxTabs<Tab> label="Khu chăm sóc khách" value={tab} onChange={setTab} tabs={[["log", "Ghi chăm sóc"], ["team", "Thống kê phòng"]]} />
      {tab === "log" ? <CarePanel key={customer} /> : <CareTeam onOpenCustomer={openCustomer} canVerify={canVerify} />}
    </div>
  );
}
