import { UploadReviewForm } from "@/components/shipment-slips/UploadReviewForm";

export default function NewShipmentSlipPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Nhập phiếu đi hàng</h1>
        <p className="text-sm text-gray-500">Chụp ảnh phiếu xuất kho bán hàng — AI đọc và điền sẵn, anh kiểm tra rồi lưu</p>
      </div>
      <UploadReviewForm />
    </div>
  );
}
