import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { ShieldCheck, Sparkles } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex bg-[#090a0f] text-white relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-brandRed-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Hero Image Section — Hoang Gia Factory banner */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden border-r border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/company-banner.webp"
          alt="Nhà máy Hoàng Gia PS"
          className="absolute inset-0 h-full w-full object-cover scale-105 filter brightness-75 contrast-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090a0f] via-[#090a0f]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#090a0f]/90" />
        
        <div className="relative z-10 flex flex-col justify-between p-12 text-white h-full">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3.5 py-1.5 text-xs font-medium text-amber-300 backdrop-blur-md shadow-lg">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Hoàng Gia PS — Enterprise CRM</span>
            </div>
          </div>
          
          <div className="space-y-4">
            <h2 className="text-3xl xl:text-4xl font-extrabold leading-tight tracking-tight text-white drop-shadow-md">
              Hệ Thống Điều Hành
              <br />
              <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                Phòng Kinh Doanh Thông Minh
              </span>
            </h2>
            <p className="text-sm text-gray-300 max-w-lg leading-relaxed font-normal">
              Kiểm soát toàn diện đơn hàng, tiến độ sản xuất túi PP/PE, tình trạng giao hàng, thu hồi công nợ và mục tiêu doanh số thời gian thực.
            </p>
            <div className="flex items-center gap-6 pt-2 text-xs text-gray-400 border-t border-white/10">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Tiêu chuẩn ISO 9001:2015</span>
              </div>
              <div>•</div>
              <div>Đồng bộ tự động AMIS CRM</div>
            </div>
          </div>
        </div>
      </div>

      {/* Login Card Form */}
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 z-10">
        <div className="w-full max-w-md">
          <div className="glass-card border border-white/15 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl overflow-hidden">
            {/* Top glowing bar */}
            <div className="h-1 bg-gradient-to-r from-brandRed-500 via-amber-500 to-brandRed-600" />
            
            <div className="flex flex-col items-center gap-3 px-8 pt-8 pb-5 text-center border-b border-white/10">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.08] border border-white/20 shadow-[0_0_25px_rgba(255,255,255,0.1)] p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo/mark.svg" alt="Hoàng Gia PS" className="w-full h-auto drop-shadow" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
                  HOÀNG GIA <span className="text-amber-400 font-mono text-sm uppercase px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30">CRM</span>
                </h1>
                <p className="text-xs text-gray-400 mt-1">Đăng nhập tài khoản để vào không gian quản trị</p>
              </div>
            </div>

            <div className="px-8 py-7">
              <Suspense fallback={<div className="text-center py-6 text-xs text-gray-400">Đang tải...</div>}>
                <LoginForm />
              </Suspense>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400/80 mt-6 font-mono">
            © {new Date().getFullYear()} Công ty CP Giải pháp Đóng gói Hoàng Gia
          </p>
        </div>
      </div>
    </div>
  );
}
