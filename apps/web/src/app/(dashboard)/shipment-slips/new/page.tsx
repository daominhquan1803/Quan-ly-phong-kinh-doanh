import { UploadReviewForm } from "@/components/shipment-slips/UploadReviewForm";
import { Camera } from "lucide-react";
import Link from "next/link";

export default function NewShipmentSlipPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
          <Link href="/shipment-slips" className="hover:text-amber-400 transition-colors">
            ← Danh sách phiếu xuất kho
          </Link>
          <span>/</span>
          <span className="text-amber-400">Quét & Nhập phiếu</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <Camera className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Nhập Phiếu Xuất Kho (OCR)</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Chụp ảnh phiếu xuất kho hoặc tải ảnh/PDF — AI tự động nhận diện và trích xuất thông tin đối soát
            </p>
          </div>
        </div>
      </div>
      <UploadReviewForm />
    </div>
  );
}

