"use client";
// Lucian UX/UI Prompt #062 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#062

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import "@/components/ux/lucian.css";

const schema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

type FormValues = z.infer<typeof schema>;

const inputClass =
  "w-full bg-white/[0.05] border border-white/15 text-white placeholder:text-gray-500 rounded-2xl px-4 h-[50px] text-sm font-semibold transition-all focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "ok">("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [shake, setShake] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    if (state !== "idle") return;
    setServerError(null);
    setState("busy");
    const result = await signIn("credentials", {
      ...values,
      redirect: false,
    });

    if (result?.error) {
      setState("idle");
      setServerError("Sai email hoặc mật khẩu.");
      setShake(true);
      return;
    }
    setState("ok");
    const callbackUrl = searchParams.get("callbackUrl") ?? "/";
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("ux space-y-4", shake && "u062-shake")}
      onAnimationEnd={(e) => e.target === e.currentTarget && setShake(false)}
      noValidate
    >
      <div>
        <label htmlFor="email" className="block text-xs font-bold text-ink2 mb-1.5">
          Email đăng nhập
        </label>
        <input id="email" type="email" autoComplete="email" {...register("email")} className={cn(inputClass, errors.email && "border-rose-500/60")} placeholder="ban@hoanggia.local" />
        {errors.email && <p className="text-xs text-rose-400 mt-1.5">{errors.email.message}</p>}
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <label htmlFor="password" className="block text-xs font-bold text-ink2">
            Mật khẩu
          </label>
          <span aria-live="polite" className="text-[11px] font-extrabold text-amber-400">
            {capsLock ? "Đang bật Caps Lock" : ""}
          </span>
        </div>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            {...register("password")}
            onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
            aria-invalid={Boolean(serverError)}
            className={cn(inputClass, "pr-12", (errors.password || serverError) && "border-rose-500/60")}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="u062-eye absolute inset-y-0 right-0 flex items-center px-3.5 text-gray-400 hover:text-white transition-colors"
            aria-pressed={showPassword}
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <g className="u062-lid">
                <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                <circle cx="12" cy="12" r="3" />
              </g>
              <path className="u062-slash" d="M4 4l16 16" />
            </svg>
          </button>
        </div>
        {errors.password && <p className="text-xs text-rose-400 mt-1.5">{errors.password.message}</p>}
        {serverError && (
          <p role="alert" className="text-xs font-semibold text-rose-400 mt-1.5">
            {serverError}
          </p>
        )}
      </div>

      <div className="pt-2">
        <button type="submit" disabled={state !== "idle"} aria-label={state === "busy" ? "Đang xác thực" : state === "ok" ? "Đã đăng nhập" : undefined} className={cn("u062-go", state !== "idle" && state)}>
          <span>Đăng nhập hệ thống</span>
          <i aria-hidden="true" />
          <svg viewBox="0 0 26 26" aria-hidden="true">
            <path d="M6 13.5l4.5 4.5L20 8.5" />
          </svg>
        </button>
      </div>

      <p className="text-center text-xs text-gray-400/80 pt-2">
        Quên mật khẩu? Vui lòng liên hệ <span className="text-amber-400">Quản trị viên</span> để được cấp lại.
      </p>
    </form>
  );
}
