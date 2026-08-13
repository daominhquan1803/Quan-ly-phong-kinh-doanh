/**
 * Test thủ công luồng AI đọc ảnh phiếu đi hàng — KHÔNG chạy trong CI vì tốn phí Anthropic API.
 *
 * Cách dùng:
 *   npx tsx scripts/test-ocr.ts đường/dẫn/tới/anh-phieu.jpg
 *
 * Cần biến môi trường ANTHROPIC_API_KEY (đọc từ .env.local nếu chạy qua `npm run test:ocr`).
 */
import path from "path";
import sharp from "sharp";
import { extractShipmentSlipFromImage } from "../src/lib/anthropic";

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("Thiếu đường dẫn ảnh. Cách dùng: npx tsx scripts/test-ocr.ts <đường dẫn ảnh>");
    process.exit(1);
  }

  // Resize/convert giống hệt luồng production (xem lib/storage.ts) để kết quả test sát thực tế.
  const resized = await sharp(path.resolve(imagePath))
    .rotate()
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const base64 = resized.toString("base64");

  console.log(`Đang gửi ảnh "${imagePath}" cho Claude Vision...`);
  const { result } = await extractShipmentSlipFromImage(base64);

  console.log("\n=== Kết quả trích xuất ===");
  console.log(JSON.stringify(result, null, 2));

  if (result.lowConfidenceFields.length > 0) {
    console.log(`\n⚠ AI không chắc chắn ở: ${result.lowConfidenceFields.join(", ")}`);
  }
}

main().catch((err) => {
  console.error("Lỗi:", err instanceof Error ? err.message : err);
  process.exit(1);
});
