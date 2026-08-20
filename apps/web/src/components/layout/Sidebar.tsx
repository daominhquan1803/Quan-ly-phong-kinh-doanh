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
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard, adminOnly: false },
  { href: "/orders", label: "Đơn hàng", icon: ShoppingCart, adminOnly: false },
  { href: "/shipping-status", label: "Tiến độ giao hàng", icon: Gauge, adminOnly: false },
  { href: "/shipment-slips", label: "Phiếu đi hàng", icon: Truck, adminOnly: false },
  { href: "/debt", label: "Công nợ", icon: Wallet, adminOnly: true },
  { href: "/targets", label: "Kế hoạch kinh doanh", icon: Target, adminOnly: false },
  { href: "/kpi", label: "Đánh giá KPI", icon: Award, adminOnly: false },
  { href: "/business-trips", label: "Đăng ký đi công tác", icon: Briefcase, adminOnly: false },
  { href: "/admin/users", label: "Nhân viên", icon: Users, adminOnly: true },
];

export function Sidebar({ role }: { role?: "ADMIN" | "SALES" }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col bg-navy-900 text-white">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG tĩnh, next/image
              không tối ưu được vector nên dùng img thường cho gọn, khỏi bật dangerouslyAllowSVG */}
          <img src="/logo/mark.svg" alt="Hoàng Gia PS" className="w-full h-auto" />
        </div>
        <div className="leading-tight">
          <p className="font-semibold text-sm">HOÀNG GIA</p>
          <p className="text-[11px] text-white/60">Quản lý phòng kinh doanh</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.filter((item) => !item.adminOnly || role === "ADMIN").map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brandRed-600 text-white shadow-card"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Ảnh thật từ website công ty (hoanggiaps.com) — nhắc thương hiệu ở chân sidebar. */}
      <div className="mx-3 mb-3 overflow-hidden rounded-lg border border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/company-banner.webp" alt="Hoàng Gia PS" className="h-16 w-full object-cover" />
        <div className="bg-white/5 px-3 py-2">
          <p className="text-[11px] font-medium text-white/90">Hoàng Gia PS</p>
          <p className="text-[10px] text-white/50">Giải pháp đóng gói trọn gói</p>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-white/10 text-[11px] text-white/50">
        © {new Date().getFullYear()} Công ty CP Giải pháp Đóng gói Hoàng Gia
      </div>
    </aside>
  );
}
