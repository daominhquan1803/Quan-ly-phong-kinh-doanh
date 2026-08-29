// Tiện ích chạy ở TRÌNH DUYỆT (client) để đăng ký/huỷ đăng ký nhận thông báo đẩy (Web Push) —
// dùng bởi NotificationBell. Đọc thêm về Web Push: cần chuyển khoá công khai VAPID từ dạng
// base64url (Google/trình duyệt trả về) sang Uint8Array mà PushManager.subscribe() yêu cầu.

/** Chuyển chuỗi base64url (không padding, dùng "-"/"_") sang Uint8Array — thuật toán chuẩn theo
 * tài liệu MDN cho applicationServerKey. Tách riêng hàm để dễ unit test độc lập. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/** Đăng ký service worker (idempotent — gọi lại không tạo bản ghi trùng). */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.error("Không đăng ký được service worker:", err);
    return null;
  }
}

/** Trạng thái đăng ký nhận push HIỆN TẠI của thiết bị này (không phải của tài khoản nói chung —
 * mỗi thiết bị/trình duyệt đăng ký riêng). */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** Xin quyền + đăng ký nhận push cho thiết bị này, rồi lưu lên server. Trả về false nếu người
 * dùng từ chối quyền thông báo hoặc trình duyệt không hỗ trợ — KHÔNG ném lỗi ra ngoài để UI tự xử
 * lý bằng thông báo thân thiện thay vì crash. */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await registerServiceWorker();
  if (!registration) return false;

  const res = await fetch("/api/push/vapid-public-key");
  if (!res.ok) return false;
  const { publicKey } = (await res.json()) as { publicKey: string | null };
  if (!publicKey) return false;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
    });
  }

  const json = subscription.toJSON();
  const saveRes = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    }),
  });
  return saveRes.ok;
}

/** Huỷ nhận push trên thiết bị này — huỷ cả ở trình duyệt lẫn xoá bản ghi trên server. */
export async function unsubscribeFromPush(): Promise<boolean> {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return true;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  const res = await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  return res.ok;
}
