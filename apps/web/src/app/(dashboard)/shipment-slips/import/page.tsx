import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ShipmentSlipImportWizard } from "@/components/shipment-slips/ShipmentSlipImportWizard";

export default async function ShipmentSlipsImportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-ink">Nhập phiếu đi hàng từ Excel</h1>
        <p className="text-sm text-muted-foreground">
          Xuất file phiếu xuất kho bán hàng rồi upload tại đây để cập nhật vào hệ thống — upload lại cùng
          Số phiếu sẽ tự cập nhật, không tạo trùng.
        </p>
      </div>
      <ShipmentSlipImportWizard />
    </div>
  );
}
