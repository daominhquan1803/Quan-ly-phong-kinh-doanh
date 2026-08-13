import { SlipTable } from "@/components/shipment-slips/SlipTable";

export default function ShipmentSlipsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Phiếu đi hàng</h1>
        <p className="text-sm text-gray-500">Chụp ảnh phiếu xuất kho bán hàng, AI tự đọc và điền sẵn dữ liệu</p>
      </div>
      <SlipTable />
    </div>
  );
}
