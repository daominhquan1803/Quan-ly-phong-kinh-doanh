/**
 * Tạo link mở Google Maps với đủ các điểm dừng (đúng thứ tự đã sắp trong app) — dùng Google
 * Maps URL API công khai (KHÔNG cần API key/thẻ thanh toán), xem
 * https://developers.google.com/maps/documentation/urls/get-started#directions-action.
 * Google Maps bản miễn phí KHÔNG tự động tính thứ tự ngắn nhất — mở link xong người dùng có thể
 * tự kéo-thả sắp lại thứ tự ngay trong Maps nếu muốn, ứng dụng chỉ gộp sẵn đủ địa chỉ vào 1 link
 * theo đúng thứ tự đã sắp ở form đăng ký.
 */
export function buildGoogleMapsMultiStopUrl(addresses: (string | null | undefined)[]): string | null {
  const valid = addresses.map((a) => (a ?? "").trim()).filter(Boolean);
  if (valid.length === 0) return null;

  const destination = valid[valid.length - 1];
  const waypoints = valid.slice(0, -1);

  const params = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "driving",
  });
  if (waypoints.length > 0) {
    // Google Maps URL API giới hạn tối đa 9 waypoints (chưa tính điểm đến cuối) — cắt bớt nếu
    // vượt quá thay vì để link lỗi không mở được, không phải trường hợp thường gặp với quy mô
    // đi công tác trong ngày của phòng.
    params.set("waypoints", waypoints.slice(0, 9).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
