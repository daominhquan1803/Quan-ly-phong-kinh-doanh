import { auth } from "@/lib/auth";
import { QuoteOverview } from "@/components/quotes/QuoteOverview";

export default async function QuotesPage() {
  const session = await auth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Báo giá</h1>
        <p className="text-sm text-gray-500">
          Danh sách khách hàng đang hỏi giá của phòng kinh doanh — đồng bộ tự động hàng ngày từ Google Sheet
        </p>
      </div>
      <QuoteOverview isAdmin={session?.user?.role === "ADMIN"} />
    </div>
  );
}
