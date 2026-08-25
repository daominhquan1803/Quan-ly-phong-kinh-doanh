import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex bg-navy-900">
      {/* Ảnh thật từ website công ty (hoanggiaps.com) — chỉ hiện ở màn hình rộng. */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/company-banner.webp"
          alt="Nhà máy Hoàng Gia PS"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/70 to-navy-900/20" />
        <div className="relative z-10 flex flex-col justify-end p-12 text-white">
          <h2 className="text-2xl font-semibold leading-snug">
            Giải pháp đóng gói trọn gói
            <br />
            cho doanh nghiệp của bạn
          </h2>
          <p className="mt-3 text-sm text-white/70 max-w-md">
            Công ty CP Giải pháp Đóng gói Hoàng Gia — sản xuất Túi PP, Túi PE, Tem nhãn, Vật tư
            đóng gói theo tiêu chuẩn ISO.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white shadow-card p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG tĩnh, next/image
                  không tối ưu được vector nên dùng img thường cho gọn, khỏi bật dangerouslyAllowSVG */}
              <img src="/logo/mark.svg" alt="Hoàng Gia PS" className="w-full h-auto" />
            </div>
            <div className="text-center">
              <h1 className="text-white font-semibold text-lg">HOÀNG GIA</h1>
              <p className="text-white/60 text-sm">Hệ thống quản lý phòng kinh doanh</p>
            </div>
          </div>
          <div className="bg-card rounded-lg shadow-card p-6">
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
