import { CustomersPanel } from "@/components/customers/CustomersPanel";

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Khách hàng</h1>
        <p className="text-sm text-muted-foreground">
          Thông tin khách hàng và thời hạn công nợ — dùng để tự động tính hạn thanh toán trên trang Công nợ
        </p>
      </div>
      <CustomersPanel />
    </div>
  );
}
