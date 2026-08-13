import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { isPdfFile, renderPdfFirstPageToJpeg } from "./pdf-to-image";

// Ảnh phiếu đi hàng lưu trong public/uploads để Next.js serve trực tiếp qua URL tĩnh.
// Trên VPS, thư mục này được mount làm volume Docker (xem infra/docker-compose.yml) để
// dữ liệu không mất khi container được rebuild.
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB — khớp với giới hạn serverActions.bodySizeLimit

export class UploadTooLargeError extends Error {}

export interface SavedImage {
  /** Đường dẫn URL public, dùng thẳng trong <img src> hoặc lưu vào DB. */
  imagePath: string;
  imageThumbPath: string;
  /** Đường dẫn tuyệt đối trên đĩa của bản đã resize — dùng để gửi cho Claude Vision. */
  absoluteResizedPath: string;
}

function subdir(): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return path.join("shipment-slips", yyyy, mm);
}

/**
 * Lưu phiếu đi hàng — nhận ảnh chụp (jpg/png/...) HOẶC file PDF (phiếu xuất trực tiếp từ
 * hệ thống, không phải chụp giấy). PDF được giữ nguyên bản gốc để tải về/đối chiếu (rõ nét
 * hơn ảnh chụp), đồng thời render trang 1 thành JPEG để hiển thị + gửi OCR — dùng chung 1
 * luồng xử lý với ảnh chụp thường.
 */
export async function saveShipmentSlipImage(file: File): Promise<SavedImage> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new UploadTooLargeError(`File vượt quá giới hạn ${MAX_IMAGE_BYTES / 1024 / 1024}MB`);
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  const relDir = subdir();
  const absDir = path.join(UPLOAD_ROOT, relDir);
  await mkdir(absDir, { recursive: true });

  const resizedName = `${id}.jpg`;
  const absResized = path.join(absDir, resizedName);
  const toUrl = (name: string) => `/uploads/${relDir.split(path.sep).join("/")}/${name}`;

  if (isPdfFile(file)) {
    const originalName = `${id}-original.pdf`;
    const absOriginal = path.join(absDir, originalName);
    await writeFile(absOriginal, rawBuffer);

    const rendered = await renderPdfFirstPageToJpeg(rawBuffer);
    await sharp(rendered)
      .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(absResized);

    return { imagePath: toUrl(originalName), imageThumbPath: toUrl(resizedName), absoluteResizedPath: absResized };
  }

  const originalName = `${id}-original.jpg`;
  const absOriginal = path.join(absDir, originalName);
  await sharp(rawBuffer).rotate().jpeg({ quality: 92 }).toFile(absOriginal);
  // Cạnh dài ~1568px theo khuyến nghị Anthropic cho ảnh gửi vào Claude Vision — giảm chi phí/tăng tốc OCR.
  await sharp(rawBuffer).rotate().resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(absResized);

  return { imagePath: toUrl(originalName), imageThumbPath: toUrl(resizedName), absoluteResizedPath: absResized };
}

export async function readResizedAsBase64(absoluteResizedPath: string): Promise<string> {
  const buf = await readFile(absoluteResizedPath);
  return buf.toString("base64");
}
