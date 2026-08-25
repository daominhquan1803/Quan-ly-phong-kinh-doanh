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
        navy: {
          50: "#16233d", // tint nổi bật nhẹ (dòng tổng phụ, hàng đang chọn) — trước là nền navy rất nhạt
          100: "#1b2b48",
          700: "#16294a", // hover cho khối navy cấu trúc (sidebar không dùng shade này)
          900: "#0E1B33", // nền cấu trúc: sidebar, khối avatar, trang đăng nhập — KHÔNG dùng cho nút bấm
        },
        brandRed: {
          50: "rgba(200,16,46,0.16)", // nền nhạt cho badge (trước là đỏ rất nhạt trên nền trắng)
          600: "#C8102E",
          700: "#9E0B22",
        },
        // Thang xám bị đảo tông hoàn toàn: gray-50 giờ là nền tối nhất (nền trang),
        // gray-900 gần trắng nhất (chữ chính) — đúng như cách các theme tối vẫn làm.
        gray: {
          50: "#0A1424", // nền trang / nền lõm (bảng header, hàng hover)
          100: "#101c31", // bề mặt phụ (progress track, badge nền)
          200: "#1e2c45", // viền chủ đạo
          300: "#2a3a56", // viền/icon mờ hơn 1 chút
          400: "#5b6478", // chữ/icon mờ
          500: "#8b96ab", // chữ phụ — dùng nhiều nhất
          600: "#a3adc0",
          700: "#c7cede", // chữ phụ đậm hơn / nhãn
          900: "#E9EEF7", // gần trắng — hiếm khi còn dùng trực tiếp (đã đổi sang text-ink)
        },
        ink: "#E9EEF7", // chữ chính (thay cho text-navy-900 / text-gray-900 cũ)
        ink2: "#c7cede", // chữ phụ đậm (thay cho text-gray-700)
        muted2: "#5b6478", // chữ/icon rất mờ (thay cho text-gray-400 / text-gray-300)
        amber: {
          400: "#ecc165",
          500: "#E0A327", // điểm nhấn chính của theme: nút CTA, mục menu đang chọn, viền focus
          foreground: "#10192b",
        },
        success: { 600: "#22B378" },
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
          DEFAULT: "#101c31",
          foreground: "#8b96ab",
        },
        accent: {
          DEFAULT: "#16233d",
          foreground: "#E9EEF7",
        },
        card: {
          DEFAULT: "#101c31",
          foreground: "#E9EEF7",
        },
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 10px 24px -12px rgba(0,0,0,0.55)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
