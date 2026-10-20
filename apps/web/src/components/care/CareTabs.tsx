"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
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
      <div className="flex gap-2">
        {([
          ["log", "Ghi chăm sóc"],
          ["team", "Thống kê phòng"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              tab === key ? "border-amber-400 bg-amber-500/15 font-semibold text-amber-400" : "border-gray-200/40 text-ink2 hover:bg-white/5"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "log" ? <CarePanel key={customer} /> : <CareTeam onOpenCustomer={openCustomer} canVerify={canVerify} />}
    </div>
  );
}
