import { LogOut } from "lucide-react";

export function Header({ userName, role }: { userName?: string; role?: "ADMIN" | "SALES" }) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div>
        <p className="text-sm text-gray-500">Xin chào,</p>
        <p className="font-semibold text-gray-900">{userName ?? "—"}</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="status-badge status-badge--draft">
          {role === "ADMIN" ? "Quản trị viên" : "Nhân viên kinh doanh"}
        </span>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brandRed-600"
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </button>
        </form>
      </div>
    </header>
  );
}
