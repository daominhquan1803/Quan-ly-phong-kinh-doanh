"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Nút chuyển chủ đề Sáng / Tối. Chủ đề lưu ở localStorage("theme") và áp bằng class "light" trên
 * <html> (script trong app/layout.tsx áp sớm để không bị nháy). Mặc định: Tối. */
export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  function toggle() {
    const next = !light;
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem("theme", next ? "light" : "dark");
    } catch {
      // trình duyệt chặn localStorage: vẫn đổi được cho phiên hiện tại
    }
    setLight(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={light ? "Chuyển sang chế độ tối (ban đêm)" : "Chuyển sang chế độ sáng (ban ngày)"}
      aria-label={light ? "Chuyển sang chế độ tối" : "Chuyển sang chế độ sáng"}
      className="flex items-center gap-1.5 rounded-xl border border-gray-200/80 px-2.5 py-1.5 text-muted-foreground transition-all hover:border-amber-500/40 hover:text-amber-400"
    >
      {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      <span className="hidden text-xs font-medium sm:inline">{light ? "Tối" : "Sáng"}</span>
    </button>
  );
}
