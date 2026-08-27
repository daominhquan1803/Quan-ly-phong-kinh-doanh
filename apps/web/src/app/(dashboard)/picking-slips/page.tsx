import { PickingSlipList } from "@/components/picking-slips/PickingSlipList";

export default function PickingSlipsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Phiếu soạn hàng</h1>
        <p className="text-sm text-muted-foreground">
          Chọn khách hàng, tích chọn các mã hàng còn chưa giao để lập phiếu hướng dẫn soạn kho
        </p>
      </div>
      <PickingSlipList />
    </div>
  );
}
