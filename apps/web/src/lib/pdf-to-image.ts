import { createCanvas } from "@napi-rs/canvas";
// Dùng bản "legacy" build — bản chính thức Mozilla khuyến nghị cho môi trường Node
// (không có DOM), tự nhận diện Node và không cần cấu hình worker riêng.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Render trang đầu tiên của file PDF thành ảnh JPEG (Buffer) — dùng để đưa phiếu đi hàng
 * dạng PDF (xuất trực tiếp từ hệ thống, không phải ảnh chụp) vào chung 1 luồng lưu ảnh +
 * OCR với ảnh chụp thường (xem lib/storage.ts).
 *
 * pdfjs-dist (Apache-2.0) + @napi-rs/canvas (MIT) — cả 2 đều license permissive, an toàn
 * dùng trong phần mềm nội bộ/thương mại (tránh mupdf vì license AGPL yêu cầu mở mã nguồn
 * nếu dùng cho dịch vụ mạng, trừ khi mua license thương mại).
 */
export async function renderPdfFirstPageToJpeg(pdfBuffer: Buffer, scale = 2): Promise<Buffer> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");

    await page.render({
      // @napi-rs/canvas's canvas/context là API-compatible với Canvas/CanvasRenderingContext2D
      // của DOM nhưng không cùng type — pdfjs-dist chỉ cần đúng shape lúc runtime.
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    return canvas.toBuffer("image/jpeg", 0.92);
  } finally {
    await loadingTask.destroy();
  }
}

export function isPdfFile(file: { type?: string; name?: string }): boolean {
  if (file.type === "application/pdf") return true;
  return !!file.name?.toLowerCase().endsWith(".pdf");
}
