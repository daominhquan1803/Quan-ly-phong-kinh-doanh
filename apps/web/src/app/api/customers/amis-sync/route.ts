import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Lần đồng bộ khách hàng từ AMIS gần nhất (hiện cạnh nút trên trang Khách hàng). */
export async function GET() {
  try {
    await requireAdmin();
    const lastSync = await prisma.syncLog.findFirst({
      where: { jobType: "AMIS_CUSTOMER_SYNC", status: { not: "RUNNING" } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, finishedAt: true, status: true, message: true, recordsSynced: true },
    });
    return NextResponse.json({ lastSync });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return NextResponse.json({ error: "Không tải được trạng thái đồng bộ khách hàng" }, { status: 500 });
  }
}

/** ADMIN bấm "Đồng bộ AMIS": worker kéo danh sách khách từ AMIS CRM (chỉ đọc), tạo khách mới + điền chỗ trống. */
export async function POST() {
  try {
    const session = await requireAdmin();
    const workerUrl = process.env.WORKER_INTERNAL_URL || "http://localhost:4001";
    const token = process.env.INTERNAL_SYNC_TOKEN;
    if (!token) return NextResponse.json({ error: "Chưa cấu hình INTERNAL_SYNC_TOKEN" }, { status: 500 });

    const res = await fetch(`${workerUrl}/sync-amis-customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": token },
      body: JSON.stringify({ triggeredBy: session.user.id }),
      signal: AbortSignal.timeout(240_000), // ~2.000 khách / 100 mỗi trang, có nghỉ giữa các trang
    });
    const json = await res.json();
    if (!res.ok) return NextResponse.json({ error: json.message ?? "Đồng bộ khách hàng thất bại" }, { status: 502 });
    return NextResponse.json(json);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customers/amis-sync POST error", err);
    return NextResponse.json({ error: "Không gọi được service đồng bộ. Kiểm tra worker có đang chạy không." }, { status: 502 });
  }
}
