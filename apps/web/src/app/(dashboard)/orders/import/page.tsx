import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ImportWizard } from "@/components/orders/ImportWizard";

export default async function OrdersImportPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/orders");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-ink">Nhập đơn hàng từ Excel (AMIS)</h1>
        <p className="text-sm text-muted-foreground">
          Xuất file đơn hàng từ AMIS CRM rồi upload tại đây để cập nhật vào hệ thống.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
