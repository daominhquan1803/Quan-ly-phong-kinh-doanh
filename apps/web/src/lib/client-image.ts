/**
 * Nén ảnh ngay trên trình duyệt trước khi tải lên (ảnh chụp điện thoại thường 3-8MB): thu nhỏ cạnh dài còn tối đa
 * `maxEdge` px rồi xuất JPEG. Chỉ chạy ở client.
 */
export async function compressImage(file: File, maxEdge = 1600, quality = 0.72): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không xử lý được ảnh");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Không nén được ảnh");
  return blob;
}

export interface GeoFix {
  lat: number;
  lng: number;
  accuracyM: number;
}

/** Lấy vị trí hiện tại từ trình duyệt (cần HTTPS + người dùng cho phép). */
export function getCurrentFix(): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Thiết bị không hỗ trợ định vị"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Chưa cho phép định vị — bật quyền vị trí cho trình duyệt rồi thử lại"
              : "Không lấy được vị trí, thử lại ở nơi thoáng hơn"
          )
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }
    );
  });
}
