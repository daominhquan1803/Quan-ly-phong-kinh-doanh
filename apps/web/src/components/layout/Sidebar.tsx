"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Wallet,
  Target,
  Users,
  Gauge,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard, adminOnly: false },
  { href: "/orders", label: "Đơn hàng", icon: ShoppingCart, adminOnly: false },
  { href: "/shipping-status", label: "Tiến độ giao hàng", icon: Gauge, adminOnly: false },
  { href: "/shipment-slips", label: "Phiếu đi hàng", icon: Truck, adminOnly: false },
  { href: "/debt", label: "Công nợ", icon: Wallet, adminOnly: true },
  { href: "/targets", label: "Kế hoạch kinh doanh", icon: Target, adminOnly: false },
  { href: "/admin/users", label: "Nhân viên", icon: Users, adminOnly: true },
];

export function Sidebar({ role }: { role?: "ADMIN" | "SALES" }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col bg-navy-900 text-white">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white">
          <span className="text-navy-900 font-bold text-lg">HG</span>
        </div>
        <div className="leading-tight">
          <p className="font-semibold text-sm">HOÀNG GIA</p>
          <p className="text-[11px] text-white/60">Quản lý phòng kinh doanh</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.filter((item) => !item.adminOnly || role === "ADMIN").map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium border-l-4 border-transparent transition-colors",
                active
                  ? "bg-white/10 border-l-brandRed-600 text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-white/10 text-[11px] text-white/50">
        © {new Date().getFullYear()} Công ty CP Giải pháp Đóng gói Hoàng Gia
      </div>
    </aside>
  );
}
