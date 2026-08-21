import { NextRequest, NextResponse } from "next/server";
import { saveShipmentSlipImage, saveShipmentSlipTextFile, readResizedAsBase64, isTextFile, UploadTooLargeError } from "@/lib/storage";
import { extractShipmentSlipFromImage, extractShipmentSlipFromText } from "@/lib/anthropic";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { checkRateLimit, RateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    checkRateLimit(`ocr:${session.user.id}`, 20, 60_000); // tối đa 20 file/phút/người dùng

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file phiếu" }, { status: 400 });
    }

    // Phiếu dạng text thuần (xuất/copy trực tiếp từ hệ thống kho) — đọc thẳng nội dung, không
    // qua ảnh/Vision, đáng tin cậy hơn vì không có rủi ro đọc nhầm chữ mờ.
    if (isTextFile(file)) {
      const saved = await saveShipmentSlipTextFile(file);
      try {
        const { result, rawResponse } = await extractShipmentSlipFromText(saved.textContent);
        return NextResponse.json({
          imagePath: saved.filePath,
          imageThumbPath: null,
          ocr: result,
          ocrRawResponse: rawResponse,
        });
      } catch (ocrErr) {
        console.error("OCR (text) error", ocrErr);
        return NextResponse.json({
          imagePath: saved.filePath,
          imageThumbPath: null,
          ocr: null,
          ocrError: ocrErr instanceof Error ? ocrErr.message : "AI đọc file thất bại, vui lòng nhập tay.",
        });
      }
    }

    const saved = await saveShipmentSlipImage(file);
    const base64 = await readResizedAsBase64(saved.absoluteResizedPath);

    try {
      const { result, rawResponse } = await extractShipmentSlipFromImage(base64);
      return NextResponse.json({
        imagePath: saved.imagePath,
        imageThumbPath: saved.imageThumbPath,
        ocr: result,
        ocrRawResponse: rawResponse,
      });
    } catch (ocrErr) {
      // Ảnh đã lưu thành công dù AI đọc lỗi — vẫn trả về path để user nhập tay + đính kèm ảnh.
      console.error("OCR error", ocrErr);
      return NextResponse.json({
        imagePath: saved.imagePath,
        imageThumbPath: saved.imageThumbPath,
        ocr: null,
        ocrError:
          ocrErr instanceof Error ? ocrErr.message : "AI đọc ảnh thất bại, vui lòng nhập tay.",
      });
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof UploadTooLargeError) return NextResponse.json({ error: err.message }, { status: 413 });
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    console.error("shipment-slips/ocr error", err);
    return NextResponse.json({ error: "Không xử lý được file phiếu" }, { status: 500 });
  }
}
