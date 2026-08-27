import { LogOut } from "lucide-react";
import { ChangePasswordButton } from "@/components/layout/ChangePasswordButton";
import { NotificationBell } from "@/components/layout/NotificationBell";

function initials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1]?.[0] ?? "";
  const first = parts[0]?.[0] ?? "";
  return (first + last).toUpperCase();
}

export function Header({ userName, role }: { userName?: string; role?: "ADMIN" | "SALES" }) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-card px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-semibold text-white">
          {initials(userName)}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Xin chào,</p>
          <p className="font-semibold text-ink">{userName ?? "—"}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <NotificationBell />
        <span className="status-badge status-badge--draft">
          {role === "ADMIN" ? "Quản trị viên" : "Nhân viên kinh doanh"}
        </span>
        <ChangePasswordButton />
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brandRed-600"
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </button>
        </form>
      </div>
    </header>
  );
}
