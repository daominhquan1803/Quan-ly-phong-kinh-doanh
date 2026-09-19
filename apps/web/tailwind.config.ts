import type { Config } from "tailwindcss";

// Bảng màu thương hiệu Hoàng Gia — theme "Trung tâm điều phối" (Command Center).
// Nền tối, chữ IBM Plex, đỏ thương hiệu (#C8102E) + vàng đồng (amber, #E0A327) làm
// điểm nhấn chính. Toàn bộ thang xám (gray-*) và bg-white cũ được định nghĩa lại
// ngay tại đây thành các tông tối tương ứng — nhờ vậy phần lớn component không cần
// sửa className, chỉ cần đổi giá trị màu ở 1 chỗ duy nhất.
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mọi màu nền/chữ/viền của theme đều đọc từ biến CSS --c-* (định nghĩa ở styles/globals.css:
        // :root = tối, html.light = sáng) nên đổi Sáng/Tối chỉ cần đổi class trên <html>.
        white: "rgb(var(--c-white) / <alpha-value>)", // "trắng" theo chủ đề: trắng khi tối, xanh đen khi sáng
        navy: {
          50: "rgb(var(--c-navy-50) / <alpha-value>)", // tint nổi bật nhẹ (dòng tổng phụ, hàng đang chọn)
          100: "rgb(var(--c-navy-100) / <alpha-value>)",
          700: "rgb(var(--c-navy-700) / <alpha-value>)",
          900: "rgb(var(--c-navy-900) / <alpha-value>)", // nền cấu trúc: sidebar, thẻ, trang đăng nhập — KHÔNG dùng cho nút bấm
        },
        brandRed: {
          50: "rgba(200,16,46,0.16)", // nền nhạt cho badge
          400: "rgb(var(--c-red-400) / <alpha-value>)",
          500: "rgb(var(--c-red-500) / <alpha-value>)",
          600: "#C8102E", // đỏ thương hiệu (nền nút) — KHÔNG dùng làm màu chữ cảnh báo, xem "alert"
          700: "#9E0B22",
        },
        // Đỏ TƯƠI cho chữ/biểu tượng cảnh báo: chỉ số chưa đạt, quá hạn, nợ xấu... (anh Quân yêu cầu
        // 19/09/2026). Chủ đề sáng dùng đỏ đậm hơn để vẫn đủ tương phản trên nền trắng.
        alert: "rgb(var(--c-alert) / <alpha-value>)",
        // Thang xám bị đảo tông ở chủ đề tối: gray-50 là nền tối nhất (nền trang), gray-900 gần
        // trắng nhất (chữ chính). Chủ đề sáng đảo lại theo đúng vai trò.
        gray: {
          50: "rgb(var(--c-gray-50) / <alpha-value>)", // nền trang / nền lõm
          100: "rgb(var(--c-gray-100) / <alpha-value>)", // bề mặt phụ
          200: "rgb(var(--c-gray-200) / <alpha-value>)", // viền chủ đạo
          300: "rgb(var(--c-gray-300) / <alpha-value>)",
          400: "rgb(var(--c-gray-400) / <alpha-value>)", // chữ/icon mờ
          500: "rgb(var(--c-gray-500) / <alpha-value>)", // chữ phụ — dùng nhiều nhất
          600: "rgb(var(--c-gray-600) / <alpha-value>)",
          700: "rgb(var(--c-gray-700) / <alpha-value>)",
          900: "rgb(var(--c-gray-900) / <alpha-value>)",
        },
        ink: "rgb(var(--c-ink) / <alpha-value>)", // chữ chính
        ink2: "rgb(var(--c-ink2) / <alpha-value>)", // chữ phụ đậm
        muted2: "rgb(var(--c-muted2) / <alpha-value>)", // chữ/icon rất mờ
        amber: {
          300: "rgb(var(--c-amber-300) / <alpha-value>)",
          400: "rgb(var(--c-amber-400) / <alpha-value>)",
          500: "rgb(var(--c-amber-500) / <alpha-value>)", // điểm nhấn chính: nút CTA, mục menu đang chọn, viền focus
          foreground: "#10192b",
        },
        emerald: {
          300: "rgb(var(--c-emerald-300) / <alpha-value>)",
          400: "rgb(var(--c-emerald-400) / <alpha-value>)",
        },
        rose: {
          300: "rgb(var(--c-rose-300) / <alpha-value>)",
          400: "rgb(var(--c-rose-400) / <alpha-value>)",
        },
        blue: { 400: "rgb(var(--c-blue-400) / <alpha-value>)" },
        success: { 600: "rgb(var(--c-success) / <alpha-value>)" },
        warning: { 500: "#F2A93B" },
        info: { 500: "#5B8DEF" },
        gold: { 500: "#D4A017" },
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#E0A327",
          foreground: "#10192b",
        },
        destructive: {
          DEFAULT: "#C8102E",
          foreground: "#FFFFFF",
        },
        muted: {
          DEFAULT: "rgb(var(--c-gray-100) / <alpha-value>)",
          foreground: "rgb(var(--c-gray-500) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--c-navy-50) / <alpha-value>)",
          foreground: "rgb(var(--c-ink) / <alpha-value>)",
        },
        card: {
          DEFAULT: "rgb(var(--c-card) / <alpha-value>)",
          foreground: "rgb(var(--c-ink) / <alpha-value>)",
        },
      },      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
