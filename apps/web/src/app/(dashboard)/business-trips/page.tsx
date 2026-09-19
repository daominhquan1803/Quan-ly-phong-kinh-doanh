import { auth } from "@/lib/auth";
import { BusinessTripsPanel } from "@/components/business-trips/BusinessTripsPanel";
import { MapPin } from "lucide-react";

export default async function BusinessTripsPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(224,163,39,0.25)]">
          <MapPin className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight">Đăng Ký &amp; Lịch Trình Đi Công Tác</h1>
          <p className="text-xs text-muted2">
            {isAdmin
              ? "Duyệt đăng ký đi gặp khách hàng của nhân viên kinh doanh"
              : "Đăng ký lịch đi gặp khách hàng — sau khi được duyệt sẽ tự động tính vào điểm KPI"}
          </p>
        </div>
      </div>
      <BusinessTripsPanel isAdmin={isAdmin} />
    </div>
  );
}

