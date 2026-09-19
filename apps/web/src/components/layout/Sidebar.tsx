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
  Award,
  Briefcase,
  Receipt,
  ClipboardList,
  PackageCheck,
  Contact,
} from "lucide-react";
import { SidebarBanner } from "./SidebarBanner";

export const NAV_ITEMS = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard, adminOnly: false },
  { href: "/week-plan", label: "Kế hoạch làm việc tuần", icon: ClipboardList, adminOnly: false },
  { href: "/orders", label: "Đơn hàng", icon: ShoppingCart, adminOnly: false },
  { href: "/shipping-status", label: "Tiến độ giao hàng", icon: Gauge, adminOnly: false },
  { href: "/shipment-slips", label: "Phiếu đi hàng", icon: Truck, adminOnly: false },
  { href: "/picking-slips", label: "Phiếu soạn hàng", icon: PackageCheck, adminOnly: true },
  { href: "/quotes", label: "Báo giá", icon: Receipt, adminOnly: true },
  { href: "/debt", label: "Công nợ", icon: Wallet, adminOnly: false },
  { href: "/customers", label: "Khách hàng", icon: Contact, adminOnly: true },
  { href: "/targets", label: "Kế hoạch kinh doanh", icon: Target, adminOnly: false },
  { href: "/kpi", label: "Đánh giá KPI", icon: Award, adminOnly: false },
  { href: "/business-trips", label: "Đăng ký đi công tác", icon: Briefcase, adminOnly: false },
  { href: "/admin/users", label: "Nhân viên", icon: Users, adminOnly: true },
];

export function Sidebar({ role }: { role?: "ADMIN" | "SALES" }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col bg-[#0b1628]/95 backdrop-blur-2xl border-r border-gray-200/80 text-ink shadow-[4px_0_24px_rgba(0,0,0,0.35)] select-none">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-200/70">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-white to-gray-200 p-1.5 shadow-[0_0_15px_rgba(255,255,255,0.2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/mark.svg" alt="Hoàng Gia PS" className="w-full h-auto logo-3d-spin" />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <p className="font-bold text-sm tracking-wider text-ink">HOÀNG GIA</p>
            <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_#E0A327]"></span>
          </div>
          <p className="text-[11px] font-medium text-amber-500/90">Quản lý phòng kinh doanh</p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.filter((item) => !item.adminOnly || role === "ADMIN").map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent text-amber-400 font-semibold border-l-2 border-l-amber-500 shadow-[inset_0_1px_0_rgba(224,163,39,0.15)]"
                  : "text-ink2/70 hover:bg-navy-50/70 hover:text-ink"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
                  active ? "text-amber-400" : "text-muted2 group-hover:text-amber-400/80"
                )}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Brand Mini Banner */}
      <SidebarBanner />

      {/* Footer Copyright */}
      <div className="px-5 py-3.5 border-t border-gray-200/70 text-[11px] text-muted2 flex items-center justify-between">
        <span>© {new Date().getFullYear()} Hoàng Gia PS</span>
        <span className="text-[10px] font-mono text-muted2/60">v1.2</span>
      </div>
    </aside>
  );
}
