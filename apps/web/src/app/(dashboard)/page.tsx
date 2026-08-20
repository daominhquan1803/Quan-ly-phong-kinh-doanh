import { auth } from "@/lib/auth";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";

export default async function DashboardPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Tổng quan</h1>
        <p className="text-sm text-gray-500">
          {isAdmin
            ? "Kế hoạch kinh doanh, đơn hàng quá hạn và công nợ toàn phòng"
            : "Kế hoạch kinh doanh và đơn hàng quá hạn của bạn"}
        </p>
      </div>
      <DashboardOverview isAdmin={isAdmin} />
    </div>
  );
}
