import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { isZaloConfigured, sendZaloText, newLinkCode, LINK_CODE_TTL_MS, ZALO_TYPE_LABEL } from "@/lib/zalo-api";

export const dynamic = "force-dynamic";

const TYPES = Object.keys(ZALO_TYPE_LABEL);

/** Trạng thái liên kết Zalo của người đang đăng nhập + các loại thông báo đang tắt. */
export async function GET() {
  try {
    const session = await requireSession();
    const u = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { zaloChatId: true, zaloLinkedAt: true, zaloOffTypes: true, zaloLinkCode: true, zaloLinkCodeExpiresAt: true },
    });
    const codeActive = !!u?.zaloLinkCode && !!u.zaloLinkCodeExpiresAt && u.zaloLinkCodeExpiresAt > new Date();
    return NextResponse.json({
      configured: isZaloConfigured(),
      linked: !!u?.zaloChatId,
      linkedAt: u?.zaloLinkedAt ?? null,
      offTypes: u?.zaloOffTypes ?? [],
      code: codeActive ? u!.zaloLinkCode : null,
      codeExpiresAt: codeActive ? u!.zaloLinkCodeExpiresAt : null,
      types: ZALO_TYPE_LABEL,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("zalo GET error", err);
    return NextResponse.json({ error: "Không tải được trạng thái Zalo" }, { status: 500 });
  }
}

const actionSchema = z.object({ action: z.enum(["code", "test", "unlink"]) });

/** code = tạo mã liên kết mới; test = gửi tin thử; unlink = huỷ liên kết. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 400 });
    const userId = session.user.id;

    if (parsed.data.action === "unlink") {
      await prisma.user.update({ where: { id: userId }, data: { zaloChatId: null, zaloLinkedAt: null } });
      return NextResponse.json({ ok: true });
    }

    if (!isZaloConfigured()) return NextResponse.json({ error: "Hệ thống chưa cấu hình Zalo Bot" }, { status: 503 });

    if (parsed.data.action === "test") {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { zaloChatId: true, name: true } });
      if (!u?.zaloChatId) return NextResponse.json({ error: "Chưa liên kết Zalo" }, { status: 400 });
      const r = await sendZaloText(u.zaloChatId, `Tin thử từ Hoàng Gia CRM gửi ${u.name}. Nhận được tin này là Zalo đã kết nối tốt.`);
      if (!r.ok) return NextResponse.json({ error: `Zalo không gửi được: ${r.error}` }, { status: 502 });
      return NextResponse.json({ ok: true });
    }

    // action = code. Mã 6 số phải duy nhất giữa các mã còn hạn; thử vài lần nếu trùng.
    const expires = new Date(Date.now() + LINK_CODE_TTL_MS);
    for (let i = 0; i < 5; i++) {
      const code = newLinkCode();
      const clash = await prisma.user.findFirst({ where: { zaloLinkCode: code, id: { not: userId } }, select: { id: true } });
      if (clash) continue;
      await prisma.user.update({ where: { id: userId }, data: { zaloLinkCode: code, zaloLinkCodeExpiresAt: expires } });
      return NextResponse.json({ code, codeExpiresAt: expires });
    }
    return NextResponse.json({ error: "Không tạo được mã, thử lại" }, { status: 500 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("zalo POST error", err);
    return NextResponse.json({ error: "Có lỗi xảy ra" }, { status: 500 });
  }
}

const offSchema = z.object({ offTypes: z.array(z.string()).max(30) });

/** Lưu danh sách loại thông báo muốn TẮT trên Zalo. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const parsed = offSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    const offTypes = parsed.data.offTypes.filter((t) => TYPES.includes(t)) as never[];
    await prisma.user.update({ where: { id: session.user.id }, data: { zaloOffTypes: offTypes } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("zalo PATCH error", err);
    return NextResponse.json({ error: "Không lưu được" }, { status: 500 });
  }
}
