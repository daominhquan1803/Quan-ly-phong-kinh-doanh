import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
    const lastSync = await prisma.syncLog.findFirst({
      where: { jobType: "AMIS_ORDER_SYNC" },
      orderBy: { startedAt: "desc" },
    });
    return NextResponse.json({ lastSync });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: "Không tải được trạng thái đồng bộ" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await requireAdmin();

    const workerUrl = process.env.WORKER_INTERNAL_URL || "http://localhost:4001";
    const token = process.env.INTERNAL_SYNC_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "Chưa cấu hình INTERNAL_SYNC_TOKEN" }, { status: 500 });
    }

    const res = await fetch(`${workerUrl}/sync-amis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": token },
      body: JSON.stringify({ triggeredBy: session.user.id }),
      signal: AbortSignal.timeout(120_000), // đồng bộ AMIS có thể mất hơn debt sync nếu nhiều đơn
    });
    const json = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: json.message ?? "Đồng bộ thất bại" }, { status: 502 });
    }
    return NextResponse.json(json);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("orders/sync POST error", err);
    return NextResponse.json(
      { error: "Không gọi được service đồng bộ đơn hàng. Kiểm tra worker có đang chạy không." },
      { status: 502 }
    );
  }
}
