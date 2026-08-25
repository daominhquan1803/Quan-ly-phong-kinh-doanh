import { auth } from "@/lib/auth";
import { QuoteOverview } from "@/components/quotes/QuoteOverview";

export default async function QuotesPage() {
  const session = await auth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Báo giá</h1>
        <p className="text-sm text-muted-foreground">
          Danh sách khách hàng đang hỏi giá của Phòng Kinh doanh 1 — đồng bộ tự động hàng ngày từ Google Sheet, đã lọc
          bỏ báo giá của các phòng kinh doanh khác cùng dùng chung file
        </p>
      </div>
      <QuoteOverview isAdmin={session?.user?.role === "ADMIN"} />
    </div>
  );
}
