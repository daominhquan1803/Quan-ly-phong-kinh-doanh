import { PickingSlipWizard } from "@/components/picking-slips/PickingSlipWizard";

export default function NewPickingSlipPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Tạo Phiếu soạn hàng</h1>
        <p className="text-sm text-muted-foreground">
          Bước 1: chọn khách hàng. Bước 2: tích chọn mã hàng còn chưa giao, điền số lượng cần soạn
          và ngày cần giao.
        </p>
      </div>
      <PickingSlipWizard />
    </div>
  );
}
