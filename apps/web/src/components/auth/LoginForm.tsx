"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    setLoading(true);
    const result = await signIn("credentials", {
      ...values,
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      setServerError("Sai email hoặc mật khẩu.");
      return;
    }
    const callbackUrl = searchParams.get("callbackUrl") ?? "/";
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
          Email Đăng Nhập
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register("email")}
          className={cn(
            "w-full bg-white/[0.05] border border-white/15 text-white placeholder:text-gray-500 rounded-xl px-3.5 py-2.5 text-sm transition-all focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 font-medium",
            errors.email && "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/40"
          )}
          placeholder="ban@hoanggia.local"
        />
        {errors.email && <p className="text-xs text-rose-400 mt-1.5">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
          Mật Khẩu
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            {...register("password")}
            className={cn(
              "w-full bg-white/[0.05] border border-white/15 text-white placeholder:text-gray-500 rounded-xl px-3.5 py-2.5 pr-10 text-sm transition-all focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 font-medium",
              errors.password && "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/40"
            )}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-white transition-colors"
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4 text-gray-400" />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-rose-400 mt-1.5">{errors.password.message}</p>}
      </div>

      {serverError && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 text-xs text-rose-300">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brandRed-600 to-amber-600 hover:from-brandRed-500 hover:to-amber-500 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(225,29,72,0.3)] border border-brandRed-500/40 transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer mt-2"
      >
        {loading ? (
          "Đang xác thực tài khoản..."
        ) : (
          <>
            <LogIn className="h-4 w-4" /> Đăng nhập hệ thống
          </>
        )}
      </button>

      <p className="text-center text-xs text-gray-400/80 pt-2">
        Quên mật khẩu? Vui lòng liên hệ <span className="text-amber-400">Quản trị viên</span> để được cấp lại.
      </p>
    </form>
  );
}
