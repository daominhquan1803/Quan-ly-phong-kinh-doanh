import { auth } from "@/lib/auth";
import { KpiOverview } from "@/components/kpi/KpiOverview";

export default async function KpiPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Đánh giá KPI hàng tháng</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Chấm điểm KPI theo tháng cho từng nhân viên — Doanh số lấy tự động, các mục còn lại nhập tay"
            : "Kết quả KPI hàng tháng của bạn"}
        </p>
      </div>
      <KpiOverview isAdmin={isAdmin} />
    </div>
  );
}
