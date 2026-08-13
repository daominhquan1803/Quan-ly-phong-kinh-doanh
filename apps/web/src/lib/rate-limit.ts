// Rate-limit đơn giản trong bộ nhớ tiến trình — đủ dùng cho app nội bộ chạy 1 instance.
// Nếu sau này scale nhiều instance, cần chuyển sang Redis.
const buckets = new Map<string, { count: number; resetAt: number }>();

export class RateLimitError extends Error {}

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= limit) {
    throw new RateLimitError("Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.");
  }
  bucket.count++;
}
