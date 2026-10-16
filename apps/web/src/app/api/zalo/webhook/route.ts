import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@hoanggia/db";
import { sendZaloText } from "@/lib/zalo-api";

export const dynamic = "force-dynamic";

function secretOk(received: string | null): boolean {
  const expected = process.env.ZALO_WEBHOOK_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const HELP =
  "Để nhận thông báo từ Hoàng Gia CRM: vào app, bấm nút Zalo ở góc trên bên phải, chọn \"Liên kết\", rồi nhắn mã 6 số cho em ở đây.";

/** Zalo gọi vào khi có người nhắn bot. Chỉ xử lý tin chữ: mã 6 số hợp lệ -> gắn chat.id vào tài khoản. */
export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-bot-api-secret-token"))) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }
  try {
    const body = (await req.json()) as {
      event_name?: string;
      message?: { text?: string; chat?: { id?: string } };
    };
    const chatId = body.message?.chat?.id;
    const text = body.message?.text?.trim();
    if (body.event_name !== "message.text.received" || !chatId || !text) {
      return NextResponse.json({ message: "Ignored" });
    }

    const code = /^\d{6}$/.test(text) ? text : null;
    const user = code
      ? await prisma.user.findFirst({
          where: { zaloLinkCode: code, zaloLinkCodeExpiresAt: { gt: new Date() }, active: true },
          select: { id: true, name: true },
        })
      : null;

    if (!user) {
      await sendZaloText(chatId, code ? "Mã không đúng hoặc đã hết hạn (10 phút). Hãy tạo mã mới trong app." : HELP);
      return NextResponse.json({ message: "Success" });
    }

    await prisma.$transaction([
      // 1 tài khoản Zalo chỉ gắn với 1 người dùng: gỡ khỏi người trước đó (nếu có).
      prisma.user.updateMany({ where: { zaloChatId: chatId, id: { not: user.id } }, data: { zaloChatId: null, zaloLinkedAt: null } }),
      prisma.user.update({
        where: { id: user.id },
        data: { zaloChatId: chatId, zaloLinkedAt: new Date(), zaloLinkCode: null, zaloLinkCodeExpiresAt: null },
      }),
    ]);
    await sendZaloText(chatId, `Đã liên kết với tài khoản ${user.name}. Từ giờ thông báo công việc sẽ gửi về đây.`);
    return NextResponse.json({ message: "Success" });
  } catch (err) {
    console.error("zalo/webhook POST error", err);
    return NextResponse.json({ message: "Error" }, { status: 500 });
  }
}
