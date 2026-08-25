import { UsersPanel } from "@/components/admin/UsersPanel";

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Nhân viên</h1>
        <p className="text-sm text-muted-foreground">Quản lý tài khoản đăng nhập và ánh xạ tên nhân viên</p>
      </div>
      <UsersPanel />
    </div>
  );
}
