import { auth } from "@/lib/auth";
import { OrderTable } from "@/components/orders/OrderTable";

export default async function OrdersPage() {
  const session = await auth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Đơn hàng</h1>
        <p className="text-sm text-muted-foreground">Dữ liệu đơn hàng nhập từ file Excel xuất hàng ngày trên AMIS CRM</p>
      </div>
      <OrderTable isAdmin={session?.user?.role === "ADMIN"} />
    </div>
  );
}
