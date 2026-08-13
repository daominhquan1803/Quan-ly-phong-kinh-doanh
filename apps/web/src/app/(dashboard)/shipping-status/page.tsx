import { auth } from "@/lib/auth";
import { ShippingStatusOverview } from "@/components/shipping-status/ShippingStatusOverview";

export default async function ShippingStatusPage() {
  const session = await auth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Tiến độ giao hàng</h1>
        <p className="text-sm text-gray-500">Tỷ lệ giao đúng hạn, đơn quá hạn và cảnh báo sắp tới hạn</p>
      </div>
      <ShippingStatusOverview isAdmin={session?.user?.role === "ADMIN"} />
    </div>
  );
}
