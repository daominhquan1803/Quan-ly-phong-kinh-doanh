import { NextRequest, NextResponse } from "next/server";
import { saveShipmentSlipImage, readResizedAsBase64, UploadTooLargeError } from "@/lib/storage";
import { extractShipmentSlipFromImage } from "@/lib/anthropic";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { checkRateLimit, RateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    checkRateLimit(`ocr:${session.user.id}`, 20, 60_000); // tối đa 20 ảnh/phút/người dùng

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu ảnh phiếu" }, { status: 400 });
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
