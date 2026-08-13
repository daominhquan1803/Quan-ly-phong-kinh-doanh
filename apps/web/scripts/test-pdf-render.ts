/**
 * Test thủ công việc render trang 1 của file PDF phiếu đi hàng thành JPEG.
 * Không gọi Anthropic API — chỉ kiểm tra bước chuyển PDF -> ảnh trước khi đưa vào OCR.
 *
 * Cách dùng: npx tsx scripts/test-pdf-render.ts <đường dẫn file.pdf> [đường dẫn xuất .jpg]
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { renderPdfFirstPageToJpeg } from "../src/lib/pdf-to-image";

async function main() {
  const pdfPath = process.argv[2];
  const outPath = process.argv[3] || "pdf-render-output.jpg";
  if (!pdfPath) {
    console.error("Cách dùng: npx tsx scripts/test-pdf-render.ts <file.pdf> [output.jpg]");
    process.exit(1);
  }

  const buffer = readFileSync(path.resolve(pdfPath));
  console.log(`Đang render trang 1 của "${pdfPath}"...`);
  const jpeg = await renderPdfFirstPageToJpeg(buffer);
  writeFileSync(path.resolve(outPath), jpeg);
  console.log(`Đã lưu ảnh: ${outPath} (${(jpeg.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
