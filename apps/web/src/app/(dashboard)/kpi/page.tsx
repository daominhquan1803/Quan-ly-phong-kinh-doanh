import { auth } from "@/lib/auth";
import { KpiOverview } from "@/components/kpi/KpiOverview";
import { Award } from "lucide-react";

export default async function KpiPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(224,163,39,0.25)]">
          <Award className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight">Đánh Giá Hiệu Quả &amp; KPI Hàng Tháng</h1>
          <p className="text-xs text-muted2">
            {isAdmin
              ? "Chấm điểm KPI theo tháng cho từng nhân viên — Doanh số lấy tự động, các mục còn lại nhập tay"
              : "Kết quả KPI hàng tháng của bạn"}
          </p>
        </div>
      </div>
      <KpiOverview isAdmin={isAdmin} />
    </div>
  );
}

