import { auth } from "@/lib/auth";
import { DebtDashboard } from "@/components/debt/DebtDashboard";

export default async function DebtPage() {
  const session = await auth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Công nợ</h1>
        <p className="text-sm text-muted-foreground">Đồng bộ tự động hàng ngày từ congno.hienvi.me</p>
      </div>
      <DebtDashboard isAdmin={session?.user?.role === "ADMIN"} />
    </div>
  );
}
