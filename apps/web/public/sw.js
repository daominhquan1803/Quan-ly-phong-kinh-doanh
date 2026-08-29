// Service worker của PWA Hoàng Gia CRM — CHỈ lo 2 việc: (1) cho phép cài app lên màn hình chính
// điện thoại (điều kiện bắt buộc của trình duyệt để hiện nút "Cài đặt"/"Thêm vào màn hình chính"),
// và (2) nhận + hiển thị thông báo đẩy (Web Push) gửi từ worker khi nhắc việc Kế hoạch tuần/KPI.
// CỐ TÌNH KHÔNG cache dữ liệu app (không có "offline mode") — CRM luôn cần số liệu mới nhất
// (đơn hàng, công nợ, KPI...), cache cũ có thể khiến người dùng thấy số liệu sai mà không biết.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Không có handler "fetch" — mọi request đi thẳng ra mạng như không có service worker, đúng ý đồ
// "không cache" ở trên.

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { title: "Hoàng Gia CRM", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Hoàng Gia CRM";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/" },
    tag: payload.tag || undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        try {
          const clientPath = new URL(client.url).pathname;
          if (clientPath === targetUrl && "focus" in client) return client.focus();
        } catch (err) {
          // bỏ qua URL không parse được
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
