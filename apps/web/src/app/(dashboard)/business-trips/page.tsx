import { auth } from "@/lib/auth";
import { BusinessTripsPanel } from "@/components/business-trips/BusinessTripsPanel";

export default async function BusinessTripsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Đăng ký đi công tác</h1>
        <p className="text-sm text-gray-500">
          {isAdmin
            ? "Duyệt đăng ký đi gặp khách hàng của nhân viên kinh doanh"
            : "Đăng ký lịch đi gặp khách hàng — cần Quản trị viên duyệt mới được ghi nhận vào KPI"}
        </p>
      </div>
      <BusinessTripsPanel isAdmin={isAdmin} />
    </div>
  );
}
