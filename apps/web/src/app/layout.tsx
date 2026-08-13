import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Hoàng Gia CRM — Quản lý phòng kinh doanh",
  description:
    "Hệ thống quản lý đơn hàng, phiếu đi hàng, công nợ và kế hoạch kinh doanh — Công ty CP Giải pháp Đóng gói Hoàng Gia.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={inter.variable}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
