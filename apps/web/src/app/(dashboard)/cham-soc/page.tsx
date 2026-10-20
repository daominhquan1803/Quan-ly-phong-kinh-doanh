import { Suspense } from "react";
import { HeartHandshake } from "lucide-react";
import { auth } from "@/lib/auth";
import { isSystemAdmin } from "@/lib/rbac";
import { CareTabs } from "@/components/care/CareTabs";

export default async function CarePage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b border-white/10 pb-5">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 text-amber-400">
          <HeartHandshake className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Chăm Sóc Khách Hàng</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Ghi nhanh kết quả liên hệ khách (dưới 15 giây), đánh dấu khách mua theo vụ/dự án; xem thống kê chăm sóc, cảnh báo và vấn đề cần xử lý của phòng.
          </p>
        </div>
      </div>
      <Suspense fallback={null}>
        <CareTabs defaultTab={isAdmin ? "team" : "log"} canVerify={isSystemAdmin(session)} />
      </Suspense>
    </div>
  );
}
