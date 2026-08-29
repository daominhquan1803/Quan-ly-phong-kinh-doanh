import { LogOut } from "lucide-react";
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
  return (
    <header className="flex items-center justify-between gap-2 border-b border-gray-200 bg-card px-3 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <MobileNav role={role} />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-semibold text-white">
          {initials(userName)}
        </div>
        <div className="min-w-0">
          <p className="hidden text-sm text-muted-foreground sm:block">Xin chào,</p>
          <p className="truncate font-semibold text-ink">{userName ?? "—"}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <NotificationBell />
        <span className="status-badge status-badge--draft hidden sm:inline-flex">
          {role === "ADMIN" ? "Quản trị viên" : "Nhân viên kinh doanh"}
        </span>
        <ChangePasswordButton />
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brandRed-600"
            aria-label="Đăng xuất"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Đăng xuất</span>
          </button>
        </form>
      </div>
    </header>
  );
}
