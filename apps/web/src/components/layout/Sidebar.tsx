"use client";
// Lucian UX/UI Prompt #417 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#417

import { useEffect, useRef, useState } from "react";
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
  Package,
  FileBarChart,
  AlertTriangle,
  ClipboardCheck,
  HeartHandshake,
} from "lucide-react";
import { SidebarBanner } from "./SidebarBanner";
import "@/components/ux/lucian.css";

/** Thứ tự theo luồng làm việc (anh Quân duyệt 23/10/2026): việc hằng ngày → khách & bán hàng →
 * giao hàng & thu tiền → kế hoạch & đánh giá → hệ thống. `group` null = đứng đầu, không có tiêu đề. */
export const NAV_ITEMS = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard, adminOnly: false, group: null as string | null },
  { href: "/week-plan", label: "Kế hoạch làm việc tuần", icon: ClipboardList, adminOnly: false, group: "Làm việc hằng ngày" },
  { href: "/cham-soc", label: "Chăm sóc khách", icon: HeartHandshake, adminOnly: false, group: "Làm việc hằng ngày" },
  { href: "/business-trips", label: "Đăng ký đi công tác", icon: Briefcase, adminOnly: false, group: "Làm việc hằng ngày" },
  { href: "/customers", label: "Khách hàng", icon: Contact, adminOnly: false, group: "Khách hàng & bán hàng" },
  { href: "/quotes", label: "Báo giá", icon: Receipt, adminOnly: false, group: "Khách hàng & bán hàng" },
  { href: "/orders", label: "Đơn hàng", icon: ShoppingCart, adminOnly: false, group: "Khách hàng & bán hàng" },
  { href: "/hang-hoa", label: "Hàng hóa", icon: Package, adminOnly: false, group: "Khách hàng & bán hàng" },
  { href: "/shipping-status", label: "Tiến độ giao hàng", icon: Gauge, adminOnly: false, group: "Giao hàng & thu tiền" },
  { href: "/picking-slips", label: "Phiếu soạn hàng", icon: PackageCheck, adminOnly: false, group: "Giao hàng & thu tiền" },
  { href: "/shipment-slips", label: "Phiếu đi hàng", icon: Truck, adminOnly: false, group: "Giao hàng & thu tiền" },
  { href: "/debt", label: "Công nợ", icon: Wallet, adminOnly: false, group: "Giao hàng & thu tiền" },
  { href: "/defects", label: "Báo cáo hàng lỗi", icon: AlertTriangle, adminOnly: false, group: "Giao hàng & thu tiền" },
  { href: "/targets", label: "Kế hoạch kinh doanh", icon: Target, adminOnly: false, group: "Kế hoạch & đánh giá" },
  { href: "/kpi", label: "Đánh giá KPI", icon: Award, adminOnly: false, group: "Kế hoạch & đánh giá" },
  { href: "/kpi-admin", label: "KPI Admin", icon: ClipboardCheck, adminOnly: false, group: "Kế hoạch & đánh giá" },
  { href: "/reports", label: "Báo cáo", icon: FileBarChart, adminOnly: false, group: "Kế hoạch & đánh giá" },
  { href: "/admin/users", label: "Nhân viên", icon: Users, adminOnly: true, group: "Hệ thống" },
];

/** Tiêu đề nhóm chỉ hiện ở mục đầu tiên của nhóm (sau khi đã lọc theo quyền, nên nhóm rỗng tự biến mất). */
export const showGroupTitle = <T extends { group: string | null }>(items: T[], i: number) =>
  items[i].group !== null && items[i].group !== items[i - 1]?.group;

type AccessLevel = "FULL" | "OPERATOR" | "VIEWER";

/** Mục adminOnly (trang Nhân viên) chỉ dành cho quản trị hệ thống (ADMIN mức FULL). */
export const canSeeNavItem = (item: { adminOnly: boolean }, role?: "ADMIN" | "SALES", accessLevel?: AccessLevel) =>
  !item.adminOnly || (role === "ADMIN" && (accessLevel ?? "FULL") === "FULL");

export function Sidebar({ role, accessLevel }: { role?: "ADMIN" | "SALES"; accessLevel?: AccessLevel }) {
  const pathname = usePathname();
  const visible = NAV_ITEMS.filter((item) => canSeeNavItem(item, role, accessLevel));
  const [rail, setRail] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    try {
      setRail(localStorage.getItem("sidebar") === "rail");
    } catch {
      // trình duyệt chặn localStorage: giữ thanh bên đầy đủ
    }
  }, []);

  // Con trượt nhảy tới mục đang mở (đo theo vị trí thật vì có tiêu đề nhóm xen giữa).
  useEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!pill.current) return;
    pill.current.style.opacity = active ? "1" : "0";
    if (active) pill.current.style.setProperty("--py", `${active.offsetTop}px`);
  }, [pathname, rail]);

  function toggleRail() {
    setRail((v) => {
      try {
        localStorage.setItem("sidebar", v ? "full" : "rail");
      } catch {
        // không lưu được thì chỉ đổi cho phiên này
      }
      return !v;
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const links = Array.from(nav.current?.querySelectorAll<HTMLElement>("a") ?? []);
    const next = links[links.indexOf(document.activeElement as HTMLElement) + (e.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    next.focus();
  }

  return (
    <aside
      className={cn(
        "ux u417 hidden md:flex md:flex-col shrink-0 bg-navy-900/95 backdrop-blur-2xl border-r border-gray-200/80 text-ink select-none",
        rail ? "is-rail md:w-[68px]" : "md:w-64"
      )}
    >
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-3.5 py-5 border-b border-gray-200/70">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white [--c-white:255_255_255] p-1.5 shadow-[0_0_15px_rgba(255,255,255,0.2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/mark.svg" alt="Hoàng Gia PS" className="w-full h-auto logo-3d-spin" />
        </div>
        <div className="u417-lb leading-tight">
          <div className="flex items-center gap-1.5">
            <p className="font-bold text-sm tracking-wider text-ink">HOÀNG GIA</p>
            <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_#E0A327]"></span>
          </div>
          <p className="text-[11px] font-medium text-amber-500/90">Quản lý phòng kinh doanh</p>
        </div>
      </div>

      <div className={cn("flex px-3.5 pt-3", rail ? "justify-center" : "justify-end")}>
        <button type="button" className="u417-tg" aria-expanded={!rail} aria-label={rail ? "Mở rộng thanh bên" : "Thu gọn thanh bên"} title={rail ? "Mở rộng thanh bên" : "Thu gọn thanh bên"} onClick={toggleRail}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M7.5 2.5 4 6l3.5 3.5" />
          </svg>
        </button>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
        <nav ref={nav} className="relative" aria-label="Menu chính" onKeyDown={onKeyDown}>
          <span ref={pill} className="u417-pl" aria-hidden="true" />
          {visible.map((item, i) => {
            const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href + "/"));
            const Icon = item.icon;
            return (
              <div key={item.href}>
                {showGroupTitle(visible, i) &&
                  (rail ? (
                    <hr className="mx-2 my-2 border-gray-200/60" />
                  ) : (
                    // Không cho xuống dòng: lúc đang giãn rộng mà tiêu đề gập 2 dòng thì con trượt đo sai vị trí.
                    <p className="overflow-hidden whitespace-nowrap px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted2/70">{item.group}</p>
                  ))}
                <Link href={item.href} className="u417-it" aria-current={active ? "page" : undefined} title={rail ? item.label : undefined}>
                  <Icon aria-hidden="true" />
                  <span className="u417-lb">{item.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>
      </div>

      {!rail && (
        <>
          {/* Brand Mini Banner */}
          <SidebarBanner />

          {/* Footer Copyright */}
          <div className="px-5 py-3.5 border-t border-gray-200/70 text-[11px] text-muted2 flex items-center justify-between">
            <span>© {new Date().getFullYear()} Hoàng Gia PS</span>
            <span className="text-[10px] font-mono text-muted2/60">v1.2</span>
          </div>
        </>
      )}
    </aside>
  );
}
