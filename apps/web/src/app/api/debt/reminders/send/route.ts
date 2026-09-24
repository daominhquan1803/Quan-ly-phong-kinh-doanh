import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  customerCode: z.string().trim().min(1, "Thiếu mã khách hàng"),
  milestone: z.enum(["D7", "D0", "OVERDUE"]),
});

/**
 * Nút "Gửi ngay" trên trang Công nợ. Web KHÔNG tự gửi email (nodemailer chỉ có ở worker) — gọi sang
 * worker /notify-debt-due. Worker vẫn tôn trọng DEBT_REMINDER_ENABLED và chống gửi trùng bằng
 * DebtReminderLog, nên bấm khi đã gửi rồi hoặc khi tính năng đang tắt sẽ không có thư nào đi — kết
 * quả trả về nói rõ lý do.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const parsed = sendSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const { customerCode, milestone } = parsed.data;

    // Kiểm quyền TRƯỚC khi gửi: NVKD không được gửi thư cho khách của người khác.
    const owned = await prisma.debtInvoice.findFirst({
      where: { customerCode, ...scopeByOwner(session, "salesEmployeeId") },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "Không tìm thấy công nợ của khách hàng này" }, { status: 404 });
    }

    const workerUrl = process.env.WORKER_INTERNAL_URL || "http://localhost:4001";
    const token = process.env.INTERNAL_SYNC_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "Chưa cấu hình INTERNAL_SYNC_TOKEN" }, { status: 500 });
    }

    const res = await fetch(`${workerUrl}/notify-debt-due`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": token },
      body: JSON.stringify({ customerCode, milestone, triggeredBy: session.user.id }),
      signal: AbortSignal.timeout(120_000), // gửi mail + dựng .xlsx chậm hơn API thường
    });
    const json = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: json.error ?? "Gửi thư nhắc thất bại" }, { status: 502 });
    }
    return NextResponse.json(json);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/reminders/send POST error", err);
    return NextResponse.json(
      { error: "Không gọi được service gửi thư. Kiểm tra worker có đang chạy không." },
      { status: 502 }
    );
  }
}
