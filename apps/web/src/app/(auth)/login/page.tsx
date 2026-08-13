import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-900 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white shadow-card">
            <span className="text-navy-900 font-bold text-2xl">HG</span>
          </div>
          <div className="text-center">
            <h1 className="text-white font-semibold text-lg">HOÀNG GIA</h1>
            <p className="text-white/60 text-sm">Hệ thống quản lý phòng kinh doanh</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-card p-6">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
