import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireInternalToken, UnauthorizedError } from "@/lib/rbac";
import { overdueDays, remainingAmount } from "@/lib/debt-status";
import { normalizeCustomerCode } from "@/lib/debt-customer-match";
import {
  DEBT_REMINDER_DAYS_BEFORE,
  DebtReminderMilestone,
  isValidEmail,
  parseEmailList,
  reminderMilestoneFor,
  reminderOccurrence,
} from "@/lib/debt-reminder";

export const dynamic = "force-dynamic";

// Phạm vi PKD1 theo điều kiện DB dùng khắp app (xem lib/dashboard-metrics.ts) — KHÔNG hardcode mã
// nhân viên. Lọc CHẶT có chủ ý: hoá đơn chưa gán NVKD, hoặc NVKD không thoả điều kiện này, bị bỏ qua
// hoàn toàn — thà sót vài khách còn hơn gửi lẫn thư cho khách phòng khác.
const PKD1_EMPLOYEE = { active: true, amisEmployeeCode: { not: null }, includeInSalesStats: true } as const;

const SAMPLE_LIMIT = 20;

function isMilestone(v: string | null): v is DebtReminderMilestone {
  return v === "D7" || v === "D0" || v === "OVERDUE";
}

/**
 * Cho worker gọi để lấy danh sách hoá đơn công nợ ĐẾN MỐC nhắc hôm nay (D7 / D0 / OVERDUE, với
 * OVERDUE có thêm số "lần nhắc" occurrence), đã gom theo (khách hàng, mốc, occurrence) kèm địa chỉ
 * email nhận thư — dùng gửi thư nhắc lịch thanh toán cho khách (xem
 * apps/worker/src/notifications/debtDueReminder.ts). Hoá đơn đã gửi đúng (mốc, hạn thanh toán,
 * occurrence) này rồi thì không trả về. Bảo vệ bằng INTERNAL_SYNC_TOKEN, không qua NextAuth (nên
 * KHÔNG dùng scopeByOwner). Query tuỳ chọn: customerCode (chỉ 1 khách — nút "Gửi ngay"), milestone.
 * Mỗi nhóm còn trả `displayOccurrence` — số "lần thứ N" THỰC SỰ in trong thư, khác `occurrence` (lần
 * theo lịch, dùng cho lịch gửi/khoá chống trùng/ngưỡng ý khởi kiện) khi khách có
 * `Customer.manualOverdueReminderBase` (NVKD đã tự nhắc tay nợ cũ trước khi dùng hệ thống).
 */
export async function GET(req: NextRequest) {
  try {
    requireInternalToken(req);

    const { searchParams } = new URL(req.url);
    const customerCodeParam = searchParams.get("customerCode")?.trim();
    const normCustomerFilter = customerCodeParam ? normalizeCustomerCode(customerCodeParam) : null;
    const milestoneParam = searchParams.get("milestone");
    if (milestoneParam && !isMilestone(milestoneParam)) {
      return NextResponse.json({ error: "milestone không hợp lệ" }, { status: 400 });
    }
    const milestoneFilter = milestoneParam as DebtReminderMilestone | null;

    const today = new Date();
    const matchesCustomerFilter = (code: string) => !normCustomerFilter || normalizeCustomerCode(code) === normCustomerFilter;

    const invoices = await prisma.debtInvoice.findMany({
      where: { dueDate: { not: null }, salesEmployee: PKD1_EMPLOYEE },
      // Thứ tự cố định giữa các lượt chạy: "hoá đơn đầu tiên trong nhóm" (CC + chữ ký + đối chiếu
      // lần nhắc quá hạn ưu tiên) không đổi ngẫu nhiên giữa các ngày/lượt gọi, và ghi log theo cùng
      // thứ tự này giữa 2 lượt song song giúp giảm khả năng deadlock ở transaction ghi log.
      orderBy: [{ customerCode: "asc" }, { id: "asc" }],
      select: {
        id: true,
        customerCode: true,
        customerName: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        originalAmount: true,
        paidAmount: true,
        source: true,
        salesEmployeeId: true,
        salesEmployee: { select: { name: true, notifyEmail: true, email: true, phone: true } },
      },
    });

    // Tính mốc + số ngày quá hạn + lần nhắc (occurrence) trong JS để định nghĩa mốc nằm ở đúng 1 chỗ
    // (lib/debt-reminder.ts).
    const due = invoices
      .filter((inv) => matchesCustomerFilter(inv.customerCode))
      .map((inv) => {
        const original = Number(inv.originalAmount);
        const paid = Number(inv.paidAmount);
        const days = overdueDays(inv.dueDate, today)!; // dueDate not null theo where ở trên
        const milestone = reminderMilestoneFor({ dueDate: inv.dueDate, originalAmount: original, paidAmount: paid }, today);
        return { inv, remaining: remainingAmount(original, paid), days, milestone, occurrence: milestone ? reminderOccurrence(milestone, days) : 0 };
      })
      .filter((x): x is typeof x & { milestone: DebtReminderMilestone } => x.milestone !== null && (!milestoneFilter || x.milestone === milestoneFilter));

    // Loại hoá đơn đã gửi đúng (hoá đơn, mốc, hạn thanh toán, lần nhắc) — hạn đổi thì khoá mới, được
    // gửi lại; lần nhắc quá hạn tăng lên thì cũng là khoá mới (thư mới, không phải gửi trùng).
    const logs = await prisma.debtReminderLog.findMany({
      where: { invoiceId: { in: due.map((x) => x.inv.id) } },
      select: { invoiceId: true, milestone: true, dueDate: true, occurrence: true },
    });
    const sentKeys = new Set(logs.map((l) => `${l.invoiceId}|${l.milestone}|${l.dueDate.getTime()}|${l.occurrence}`));
    const pending = due.filter((x) => !sentKeys.has(`${x.inv.id}|${x.milestone}|${x.inv.dueDate!.getTime()}|${x.occurrence}`));

    // Số thư OVERDUE hệ thống đã gửi cho TỪNG hoá đơn (mọi dueDate/occurrence) — dùng cho
    // displayOccurrence (mục E). Tái dùng luôn kết quả query log ở trên, KHÔNG query thêm.
    const priorOverdueCount = new Map<string, number>();
    for (const l of logs) {
      if (l.milestone !== "OVERDUE") continue;
      priorOverdueCount.set(l.invoiceId, (priorOverdueCount.get(l.invoiceId) ?? 0) + 1);
    }

    // Mã ở DebtInvoice và Customer có thể lệch hoa/thường/tiền tố -> so khớp qua normalizeCustomerCode.
    const customers = await prisma.customer.findMany({
      select: { customerCode: true, customerName: true, contactPerson: true, email: true, manualOverdueReminderBase: true },
    });
    const customerByNorm = new Map<string, (typeof customers)[number]>();
    for (const c of customers) {
      const norm = normalizeCustomerCode(c.customerCode);
      if (!customerByNorm.has(norm)) customerByNorm.set(norm, c);
    }

    const skippedNoEmail = new Set<string>();
    const byGroup = new Map<string, typeof pending>();
    for (const x of pending) {
      // occurrence trong khoá: 2 hoá đơn cùng khách, cùng mốc OVERDUE nhưng khác lần nhắc (quá hạn
      // khác số ngày) KHÔNG được gộp chung 1 thư — xem ví dụ HĐ-A/B/C trong kế hoạch.
      const key = `${normalizeCustomerCode(x.inv.customerCode)}|${x.milestone}|${x.occurrence}`;
      const list = byGroup.get(key);
      if (list) list.push(x);
      else byGroup.set(key, [x]);
    }

    const groups = [];
    for (const items of byGroup.values()) {
      const first = items[0];
      const customer = customerByNorm.get(normalizeCustomerCode(first.inv.customerCode));
      const allTo = parseEmailList(customer?.email);
      const to = allTo.filter(isValidEmail);
      if (allTo.length > to.length) {
        console.warn(
          `internal/debt-due-soon: khách ${first.inv.customerCode} có email sai định dạng: ${allTo.filter((a) => !isValidEmail(a)).join(", ")}`
        );
      }
      if (to.length === 0) {
        skippedNoEmail.add(first.inv.customerCode);
        continue;
      }
      // NVKD của hoá đơn đầu tiên — CC + mục Người phụ trách trong thư (chữ ký thư là hằng số, không
      // theo NVKD).
      const sales = first.inv.salesEmployee;
      // Chỉ dùng notifyEmail: User.email là email đăng nhập (thường @hoanggia.local, không nhận được thư),
      // CC vào đó sẽ bounce và lộ địa chỉ nội bộ giả cho khách. Thiếu notifyEmail thì không CC.
      const ccAddress = sales?.notifyEmail?.trim();
      const ccValid = ccAddress && isValidEmail(ccAddress) ? ccAddress : null;
      // displayOccurrence (GIẢ ĐỊNH 11-14): D7/D0 luôn bằng occurrence (=1). OVERDUE: override của khách
      // (manualOverdueReminderBase != null, kể cả 0) là số lần NVKD đã nhắc tay NỢ CŨ, nên CHỈ áp cho hoá
      // đơn BASELINE (anh Quân chốt). Hoá đơn khác (NEW_INVOICE) giữ số theo lịch, không thì hoá đơn mới
      // chưa từng được nhắc vẫn bị in "lần thứ 4". Đếm THEO TỪNG HOÁ ĐƠN (GIẢ ĐỊNH 12), lấy MIN nếu các
      // hoá đơn trong nhóm lệch nhau (GIẢ ĐỊNH 13) — không bao giờ in số lớn hơn sự thật.
      const base = customer?.manualOverdueReminderBase;
      const displayOccurrence =
        first.milestone === "OVERDUE"
          ? Math.min(
              ...items.map((x) =>
                x.inv.source === "BASELINE" && base != null ? base + (priorOverdueCount.get(x.inv.id) ?? 0) + 1 : x.occurrence
              )
            )
          : first.occurrence;
      groups.push({
        customerCode: first.inv.customerCode,
        customerName: customer?.customerName ?? first.inv.customerName,
        contactPerson: customer?.contactPerson ?? null,
        milestone: first.milestone,
        occurrence: first.occurrence,
        displayOccurrence,
        dueDate: first.inv.dueDate!.toISOString(),
        daysFromDue: first.days,
        to,
        cc: ccValid ? [ccValid] : [],
        salesEmployeeName: sales?.name ?? null,
        salesEmployeePhone: sales?.phone ?? null,
        salesEmployeeEmail: ccValid,
        totalRemaining: items.reduce((sum, x) => sum + x.remaining, 0),
        invoices: items.map((x) => ({
          id: x.inv.id,
          invoiceNumber: x.inv.invoiceNumber,
          invoiceDate: x.inv.invoiceDate?.toISOString() ?? null,
          dueDate: x.inv.dueDate!.toISOString(),
          remainingAmount: x.remaining,
        })),
      });
    }

    // Khách tới mốc nhưng NVKD không thuộc PKD1 / hoá đơn chưa gán NVKD — chỉ để log, KHÔNG gửi.
    const outsideInvoices = await prisma.debtInvoice.findMany({
      where: {
        dueDate: { not: null },
        OR: [{ salesEmployeeId: null }, { salesEmployee: { NOT: PKD1_EMPLOYEE } }],
      },
      select: { customerCode: true, dueDate: true, originalAmount: true, paidAmount: true },
    });
    const skippedNotPkd1 = new Set<string>();
    for (const inv of outsideInvoices) {
      if (!matchesCustomerFilter(inv.customerCode)) continue;
      const milestone = reminderMilestoneFor(
        { dueDate: inv.dueDate, originalAmount: Number(inv.originalAmount), paidAmount: Number(inv.paidAmount) },
        today
      );
      if (milestone && (!milestoneFilter || milestone === milestoneFilter)) skippedNotPkd1.add(inv.customerCode);
    }

    // Hoá đơn còn nợ nhưng THIẾU dueDate -> gom theo NVKD để worker tạo thông báo nội bộ.
    const noDueInvoices = await prisma.debtInvoice.findMany({
      where: { dueDate: null, salesEmployee: PKD1_EMPLOYEE },
      select: {
        id: true,
        customerName: true,
        invoiceNumber: true,
        originalAmount: true,
        paidAmount: true,
        salesEmployeeId: true,
        salesEmployee: { select: { name: true } },
      },
    });
    const missingByEmployee = new Map<
      string,
      { salesEmployeeId: string; salesEmployeeName: string; invoices: { id: string; customerName: string; invoiceNumber: string | null }[] }
    >();
    for (const inv of noDueInvoices) {
      if (!inv.salesEmployeeId || !inv.salesEmployee) continue;
      if (remainingAmount(Number(inv.originalAmount), Number(inv.paidAmount)) <= 0) continue;
      const entry = missingByEmployee.get(inv.salesEmployeeId) ?? {
        salesEmployeeId: inv.salesEmployeeId,
        salesEmployeeName: inv.salesEmployee.name,
        invoices: [],
      };
      entry.invoices.push({ id: inv.id, customerName: inv.customerName, invoiceNumber: inv.invoiceNumber });
      missingByEmployee.set(inv.salesEmployeeId, entry);
    }

    return NextResponse.json({
      today: today.toISOString(),
      daysBefore: DEBT_REMINDER_DAYS_BEFORE,
      skippedNoEmail: Array.from(skippedNoEmail).slice(0, SAMPLE_LIMIT),
      skippedNoEmailCount: skippedNoEmail.size,
      skippedNotPkd1: Array.from(skippedNotPkd1).slice(0, SAMPLE_LIMIT),
      skippedNotPkd1Count: skippedNotPkd1.size,
      groups,
      missingDueDate: Array.from(missingByEmployee.values()),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("internal/debt-due-soon GET error", err);
    return NextResponse.json({ error: "Không lấy được danh sách công nợ tới hạn nhắc" }, { status: 500 });
  }
}
