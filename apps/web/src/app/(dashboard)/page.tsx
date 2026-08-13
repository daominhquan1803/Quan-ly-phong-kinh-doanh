import { DashboardOverview } from "@/components/dashboard/DashboardOverview";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Tổng quan</h1>
        <p className="text-sm text-gray-500">Kế hoạch kinh doanh, đơn hàng quá hạn và công nợ</p>
      </div>
      <DashboardOverview />
    </div>
  );
}
