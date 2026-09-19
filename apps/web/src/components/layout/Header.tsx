import { LogOut, ShieldCheck, User } from "lucide-react";
import { ChangePasswordButton } from "@/components/layout/ChangePasswordButton";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { MobileNav } from "@/components/layout/MobileNav";

function initials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1]?.[0] ?? "";
  const first = parts[0]?.[0] ?? "";
  return (first + last).toUpperCase();
}

export function Header({ userName, role }: { userName?: string; role?: "ADMIN" | "SALES" }) {
  const isAdmin = role === "ADMIN";

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-gray-200/80 px-4 py-3 sm:px-6 shadow-[0_4px_20px_rgba(0,0,0,0.25)]">
      {/* Lớp nền mờ tách riêng: backdrop-filter đặt thẳng lên <header> sẽ biến header thành khung
          chứa của mọi phần tử position:fixed bên trong (khay menu điện thoại, lớp bấm-ra-ngoài của
          chuông thông báo/đổi mật khẩu) khiến chúng bị bó vào chiều cao thanh header. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[#0c182b]/80 backdrop-blur-xl" />
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
        <MobileNav role={role} />
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-navy-100 to-navy-900 border border-amber-500/30 text-xs font-mono font-bold text-amber-400 shadow-[0_0_12px_rgba(224,163,39,0.2)]">
          {initials(userName)}
          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-navy-900"></span>
        </div>
        <div className="min-w-0">
          <p className="hidden text-[11px] font-medium text-muted-foreground sm:block">Xin chào,</p>
          <p className="truncate text-sm font-semibold text-ink tracking-tight">{userName ?? "—"}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5 sm:gap-4">
        <NotificationBell />

        <span
          className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border backdrop-blur-md ${
            isAdmin
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[0_0_10px_rgba(224,163,39,0.15)]"
              : "bg-info-500/10 border-info-500/30 text-info-500 shadow-[0_0_10px_rgba(91,141,239,0.15)]"
          }`}
        >
          {isAdmin ? <ShieldCheck className="h-3 w-3" /> : <User className="h-3 w-3" />}
          {isAdmin ? "Quản trị viên" : "Nhân viên kinh doanh"}
        </span>

        <ChangePasswordButton />

        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-xl border border-transparent px-2.5 py-1.5 text-sm text-muted-foreground hover:border-brandRed-600/30 hover:bg-brandRed-50/10 hover:text-brandRed-600 transition-all"
            aria-label="Đăng xuất"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline text-xs font-medium">Đăng xuất</span>
          </button>
        </form>
      </div>
    </header>
  );
}
