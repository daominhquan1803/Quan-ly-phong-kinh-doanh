import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ManualOrderWizard } from "@/components/orders/ManualOrderWizard";

export default async function ManualOrderPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-ink">Thêm đơn hàng thủ công</h1>
        <p className="text-sm text-muted-foreground">
          Upload file Excel &quot;Đơn đặt hàng&quot; (1 file = 1 đơn) — dùng khi khách vừa gửi PO mà chưa kịp lên AMIS.
        </p>
      </div>
      <ManualOrderWizard isAdmin={session.user.role === "ADMIN"} />
    </div>
  );
}
