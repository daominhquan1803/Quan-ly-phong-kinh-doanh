"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import Image from "next/image";

const BANNERS = [
  "https://hoanggiaps.com/wp-content/uploads/2026/03/cong-ty-giai-phap-dong-goi-hoanggia-ps.webp",
  "https://hoanggiaps.com/wp-content/uploads/2026/03/in-tem-nhan-hoanggiaps.webp",
];

export function SidebarBanner() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % BANNERS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-gray-200/80 bg-navy-900/50 shadow-sm backdrop-blur-md">
      <div className="relative h-16 w-full">
        {BANNERS.map((banner, index) => (
          <Image
            key={banner}
            src={banner}
            alt="Hoàng Gia PS"
            fill
            className={`object-cover transition-opacity duration-1000 ${
              index === currentIndex ? "opacity-80" : "opacity-0"
            }`}
            sizes="250px"
          />
        ))}
      </div>
      <div className="bg-navy-900/90 px-3 py-2 border-t border-gray-200/50">
        <p className="text-[11px] font-semibold text-ink flex items-center gap-1">
          Hoàng Gia PS <Sparkles className="h-2.5 w-2.5 text-amber-400 inline" />
        </p>
        <p className="text-[10px] text-muted2">Giải pháp đóng gói toàn diện</p>
      </div>
    </div>
  );
}
