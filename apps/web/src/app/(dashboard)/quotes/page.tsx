import { auth } from "@/lib/auth";
import { QuoteOverview } from "@/components/quotes/QuoteOverview";
import { FileText } from "lucide-react";

export default async function QuotesPage() {
  const session = await auth();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(224,163,39,0.25)]">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight">Theo Dõi Báo Giá Khách Hàng</h1>
          <p className="text-xs text-muted2">
            Danh sách khách hàng đang hỏi giá của Phòng Kinh doanh 1 — đồng bộ tự động hàng ngày từ Google Sheet
          </p>
        </div>
      </div>
      <QuoteOverview isAdmin={session?.user?.role === "ADMIN"} />
    </div>
  );
}

