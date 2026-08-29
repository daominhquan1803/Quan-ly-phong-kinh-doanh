"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./Sidebar";

/** Menu điều hướng cho màn hình nhỏ (điện thoại) — Sidebar chính bị ẩn hẳn dưới breakpoint "md"
 * (xem Sidebar.tsx: "hidden md:flex"), nên trên điện thoại cần 1 cách khác để sang các mục như
 * "Đăng ký đi công tác", "Kế hoạch làm việc tuần"... Dùng nút hamburger mở 1 khay trượt từ trái,
 * cùng danh sách NAV_ITEMS với Sidebar để 2 nơi luôn khớp nhau khi thêm/bớt mục menu sau này. */
export function MobileNav({ role }: { role?: "ADMIN" | "SALES" }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        className="rounded-md p-2 text-muted-foreground hover:bg-gray-50 hover:text-ink"
        aria-label="Mở menu điều hướng"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-navy-900 text-white shadow-xl">
            <div className="flex items-center justify-between gap-3 px-5 py-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo/mark.svg" alt="Hoàng Gia PS" className="w-full h-auto" />
                </div>
                <div className="leading-tight">
                  <p className="font-semibold text-sm">HOÀNG GIA</p>
                  <p className="text-[11px] text-white/60">Quản lý phòng kinh doanh</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Đóng menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.filter((item) => !item.adminOnly || role === "ADMIN").map((item) => {
                const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-amber-500/10 text-amber-500 ring-1 ring-inset ring-amber-500/30"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
