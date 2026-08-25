import { auth } from "@/lib/auth";
import { SlipTable } from "@/components/shipment-slips/SlipTable";

export default async function ShipmentSlipsPage() {
  const session = await auth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Phiếu đi hàng</h1>
        <p className="text-sm text-muted-foreground">Nhập từ file Excel phiếu xuất kho bán hàng</p>
      </div>
      <SlipTable isAdmin={session?.user?.role === "ADMIN"} />
    </div>
  );
}
