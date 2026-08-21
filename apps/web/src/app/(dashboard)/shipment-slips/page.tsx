import { SlipTable } from "@/components/shipment-slips/SlipTable";

export default function ShipmentSlipsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Phiếu đi hàng</h1>
        <p className="text-sm text-gray-500">Nhập từ file Excel phiếu xuất kho bán hàng</p>
      </div>
      <SlipTable />
    </div>
  );
}
