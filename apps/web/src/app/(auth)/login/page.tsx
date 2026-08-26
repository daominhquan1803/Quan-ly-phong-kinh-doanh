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
          <span className="inline-flex w-fit items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm mb-4">
            Công ty CP Giải pháp Đóng gói Hoàng Gia
          </span>
          <h2 className="text-2xl font-semibold leading-snug">
            Giải pháp đóng gói trọn gói
            <br />
            cho doanh nghiệp của bạn
          </h2>
          <p className="mt-3 text-sm text-white/70 max-w-md">
            Sản xuất Túi PP, Túi PE, Tem nhãn, Vật tư đóng gói theo tiêu chuẩn ISO.
          </p>
        </div>
      </div>

      {/* Form đăng nhập — gộp logo/tiêu đề vào chung 1 khối thẻ với form thay vì để rời rạc, có
          viền nhấn trên cùng theo đúng quy ước "kpi-card" (viền trên 4px) đã dùng trong toàn app. */}
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md">
          <div className="rounded-xl bg-card shadow-card border-t-4 border-brandRed-600 overflow-hidden">
            <div className="flex flex-col items-center gap-3 px-8 pt-8 pb-6 text-center border-b border-gray-200">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white shadow-card p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- SVG tĩnh, next/image
                    không tối ưu được vector nên dùng img thường cho gọn, khỏi bật dangerouslyAllowSVG */}
                <img src="/logo/mark.svg" alt="Hoàng Gia PS" className="w-full h-auto" />
              </div>
              <div>
                <h1 className="text-ink font-semibold text-lg">HOÀNG GIA</h1>
                <p className="text-muted-foreground text-sm mt-0.5">Hệ thống quản lý phòng kinh doanh</p>
              </div>
            </div>
            <div className="px-8 py-6">
              <Suspense fallback={null}>
                <LoginForm />
              </Suspense>
            </div>
          </div>
          <p className="text-center text-xs text-muted2 mt-6">
            Công ty CP Giải pháp Đóng gói Hoàng Gia
          </p>
        </div>
      </div>
    </div>
  );
}
