"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push-client";

/** Đăng ký service worker ngay khi app tải xong — điều kiện bắt buộc để trình duyệt hiện nút "Cài
 * đặt"/"Thêm vào màn hình chính" (PWA). KHÔNG tự xin quyền thông báo đẩy ở đây — việc đó để người
 * dùng chủ động bấm nút trong NotificationBell, xin quyền tự động khi vừa mở app dễ bị trình
 * duyệt chặn hoặc bị người dùng từ chối vĩnh viễn vì thấy đường đột. Không render gì cả. */
export function PwaRegister() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return null;
}
