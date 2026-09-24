import { prisma } from "@hoanggia/db";
import { logger } from "../logger";
import { isEmailConfigured, sendEmail } from "../email";
import {
  buildDebtReminderHtml,
  buildDebtReminderSubject,
  buildDebtReminderXlsx,
  DebtReminderData,
} from "./templates/debtReminder";

const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL || "http://web:3000";
const INTERNAL_SYNC_TOKEN = process.env.INTERNAL_SYNC_TOKEN;

type Milestone = "D7" | "D0" | "OVERDUE";

interface DebtDueSoonGroup extends DebtReminderData {
  customerCode: string;
  to: string[];
  cc: string[];
  invoices: (DebtReminderData["invoices"][number] & { id: string })[];
}
interface DebtDueSoonResponse {
  skippedNoEmail: string[];
  skippedNoEmailCount?: number;
  skippedNotPkd1: string[];
  skippedNotPkd1Count?: number;
  groups: DebtDueSoonGroup[];
  missingDueDate: {
    salesEmployeeId: string;
    salesEmployeeName: string;
    invoices: { id: string; customerName: string; invoiceNumber: string | null }[];
  }[];
}

export interface DebtDueReminderResult {
  checked: number;
  sent: number;
  skippedNoEmail: number;
  notifiedMissingDueDate: number;
  // Có giá trị khi job KHÔNG chạy (chưa bật/chưa cấu hình) — để nút "Gửi ngay" báo rõ lý do.
  skippedReason?: string;
}

/** Thứ 2 của tuần dương lịch chứa `d` — bản sao của mondayOfWeek ở apps/web/src/lib/debt-status.ts
 * (worker không import được lib của web, giống cách todayRange() được lặp ở các module nhắc việc). */
function mondayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=CN..6=T7
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + diff);
  return monday;
}

function yyyymmdd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Gửi thư nhắc lịch thanh toán công nợ CHO KHÁCH HÀNG (mốc D7 = trước hạn 7 ngày, D0 = đúng ngày đến
 * hạn, OVERDUE = quá hạn — gửi LẶP LẠI mỗi 7 ngày quá hạn, không giới hạn số lần), CC NVKD phụ trách;
 * và thông báo trong app cho NVKD có hoá đơn thiếu hạn thanh toán (1 lần/tuần). Đây là thư gửi RA
 * NGOÀI công ty nên MẶC ĐỊNH TẮT — chỉ chạy khi DEBT_REMINDER_ENABLED=true. Chống gửi trùng: ghi
 * DebtReminderLog TRƯỚC khi gửi, dùng unique (invoiceId, milestone, dueDate, occurrence) làm khoá chốt.
 */
export async function runDebtDueReminder(options: {
  customerCode?: string; // chỉ gửi cho 1 khách (nút "Gửi ngay")
  milestone?: Milestone;
  triggeredBy?: string; // "CRON" (mặc định) hoặc User.id
} = {}): Promise<DebtDueReminderResult> {
  const triggeredBy = options.triggeredBy ?? "CRON";
  const skip = (skippedReason: string): DebtDueReminderResult => {
    logger.warn(`${skippedReason} — bỏ qua nhắc công nợ tới hạn.`);
    return { checked: 0, sent: 0, skippedNoEmail: 0, notifiedMissingDueDate: 0, skippedReason };
  };

  if (!INTERNAL_SYNC_TOKEN) return skip("Chưa cấu hình INTERNAL_SYNC_TOKEN");
  if (process.env.DEBT_REMINDER_ENABLED !== "true") {
    return skip("Gửi thư nhắc công nợ đang TẮT (DEBT_REMINDER_ENABLED chưa đặt là true)");
  }
  if (!isEmailConfigured()) return skip("Chưa cấu hình SMTP_USER/SMTP_PASSWORD");

  const query = new URLSearchParams();
  if (options.customerCode) query.set("customerCode", options.customerCode);
  if (options.milestone) query.set("milestone", options.milestone);
  const qs = query.toString();
  const res = await fetch(`${WEB_INTERNAL_URL}/api/internal/debt-due-soon${qs ? `?${qs}` : ""}`, {
    headers: { "x-internal-token": INTERNAL_SYNC_TOKEN },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`debt-due-soon trả về ${res.status}`);
  }
  const data = (await res.json()) as DebtDueSoonResponse;

  const skippedNoEmail = data.skippedNoEmailCount ?? data.skippedNoEmail.length;
  if (skippedNoEmail > 0) {
    logger.warn(`Nhắc công nợ: ${skippedNoEmail} khách tới mốc nhưng chưa có email hợp lệ (vd: ${data.skippedNoEmail.join(", ")}).`);
  }
  const skippedNotPkd1 = data.skippedNotPkd1Count ?? data.skippedNotPkd1.length;
  if (skippedNotPkd1 > 0) {
    logger.warn(`Nhắc công nợ: bỏ qua ${skippedNotPkd1} khách vì NVKD không thuộc PKD1 / chưa gán NVKD (vd: ${data.skippedNotPkd1.join(", ")}).`);
  }

  let sent = 0;
  for (const group of data.groups) {
    try {
      // Dựng nội dung TRƯỚC khi ghi log để lỗi dựng file không để lại log "đã gửi" giả.
      const subject = buildDebtReminderSubject(group);
      const html = buildDebtReminderHtml(group);
      const xlsx = buildDebtReminderXlsx(group);
      // 2 thư cùng ngày cho cùng khách (D7/D0/OVERDUE khác nhau, hoặc OVERDUE khác lần nhắc) không
      // được trùng tên file — thêm mốc + lần nhắc (chỉ OVERDUE, vì D7/D0 luôn displayOccurrence 1).
      // Dùng displayOccurrence (số khách NHÌN THẤY) chứ không phải occurrence theo lịch — khách có
      // override không được thấy tên file lộ ra số lần theo lịch thật (vd "lan31").
      const filename = `Bang-ke-cong-no-${group.customerCode.replace(/[^\w.-]/g, "_")}-${group.milestone}${
        group.milestone === "OVERDUE" ? `-lan${group.displayOccurrence}` : ""
      }-${yyyymmdd(new Date())}.xlsx`;

      // (a) Ghi log TRƯỚC khi gửi — unique (invoiceId, milestone, dueDate, occurrence) chặn 2 lượt
      // chạy song song (cron trùng nút "Gửi ngay") cùng gửi 1 thư cho khách. Ghi TỪNG dòng trong 1
      // TRANSACTION (không phải N lệnh tự commit riêng): dòng chưa commit của lượt A chặn lượt B
      // (INSERT ... ON CONFLICT phải chờ), nên B chỉ chạy tiếp khi A đã commit XONG CẢ NHÓM, lúc đó B
      // thấy MỌI dòng đã có và skip hết -> không còn kẽ hở gửi trùng khi 2 lượt đan xen giữa chừng.
      // `created` vẫn chỉ gồm dòng do CHÍNH lượt này tạo -> nhánh (d) chỉ xoá đúng dòng của mình.
      // Deadlock (2 lượt ghi khác thứ tự) -> Postgres huỷ 1 lượt, catch ở cuối vòng lặp bắt, lượt đó
      // không gửi (không crash worker, các khách khác vẫn chạy tiếp).
      const logKeys = group.invoices.map((inv) => ({
        invoiceId: inv.id,
        milestone: group.milestone,
        dueDate: new Date(inv.dueDate),
        occurrence: group.occurrence,
      }));
      const created = await prisma.$transaction(async (tx) => {
        const mine: typeof logKeys = [];
        for (const k of logKeys) {
          const { count } = await tx.debtReminderLog.createMany({
            data: [
              {
                ...k,
                // null = bằng occurrence (không override) — đúng quy ước của cột (mục E.1).
                displayOccurrence: group.displayOccurrence === group.occurrence ? null : group.displayOccurrence,
                recipients: group.to.join(", "),
                ccRecipients: group.cc.length > 0 ? group.cc.join(", ") : null,
                triggeredBy,
              },
            ],
            skipDuplicates: true,
          });
          if (count > 0) mine.push(k);
        }
        return mine;
      });
      // (b) Không tạo được dòng nào (tất cả bị skipDuplicates) -> lượt khác đã gửi rồi.
      if (created.length === 0) continue;

      if (group.cc.length === 0) {
        logger.warn(`Nhắc công nợ: NVKD ${group.salesEmployeeName ?? "(chưa rõ)"} chưa có notifyEmail — gửi khách ${group.customerCode} không CC.`);
      }

      // (c) Gửi.
      const ok = await sendEmail(group.to, subject, html, { cc: group.cc, attachments: [{ filename, content: xlsx }] });
      if (!ok) {
        // (d) Thất bại -> xoá log vừa tạo để lần chạy sau gửi lại được.
        await prisma.debtReminderLog.deleteMany({ where: { OR: created } });
        logger.error(`Nhắc công nợ: gửi thư thất bại cho khách ${group.customerCode} tới ${group.to.join(", ")}.`);
        continue;
      }
      sent++;
      const occurrenceLabel =
        group.milestone !== "OVERDUE"
          ? ""
          : group.occurrence === group.displayOccurrence
            ? ` (lần ${group.occurrence})`
            : ` (lần ${group.occurrence}, in "lần ${group.displayOccurrence}")`;
      logger.info(
        `Nhắc công nợ: đã gửi mốc ${group.milestone}${occurrenceLabel} cho khách ${group.customerCode} (${group.invoices.length} hoá đơn) — tới ${group.to.join(", ")}` +
          (group.cc.length > 0 ? `, CC ${group.cc.join(", ")}` : "") +
          `.`
      );
    } catch (err) {
      // Lỗi 1 khách không được chặn các khách còn lại.
      logger.error(`Nhắc công nợ: lỗi xử lý khách ${group.customerCode}:`, err instanceof Error ? err.message : err);
    }
  }

  // Hoá đơn thiếu hạn thanh toán: chỉ thông báo trong app cho NVKD, 1 lần/TUẦN (nợ thiếu hạn có thể
  // tồn đọng lâu, nhắc mỗi ngày sẽ thành spam). Chạy theo 1 khách (nút "Gửi ngay") thì bỏ qua bước này.
  let notifiedMissingDueDate = 0;
  if (!options.customerCode) {
    const weekStart = mondayOfWeek(new Date());
    for (const entry of data.missingDueDate) {
      const already = await prisma.notification.findFirst({
        where: { userId: entry.salesEmployeeId, type: "DEBT_DUE_DATE_MISSING", createdAt: { gte: weekStart } },
      });
      if (already) continue;

      const examples = entry.invoices
        .slice(0, 5)
        .map((inv) => `${inv.customerName} – ${inv.invoiceNumber ?? "(không số HĐ)"}`)
        .join("; ");
      await prisma.notification.create({
        data: {
          userId: entry.salesEmployeeId,
          type: "DEBT_DUE_DATE_MISSING",
          title: `${entry.invoices.length} hoá đơn chưa có hạn thanh toán`,
          message:
            `Cần điền hạn thanh toán để hệ thống nhắc khách đúng hạn. Ví dụ: ${examples}` +
            (entry.invoices.length > 5 ? `; và ${entry.invoices.length - 5} hoá đơn khác.` : "."),
          link: "/debt",
        },
      });
      notifiedMissingDueDate++;
    }
  }

  logger.info(
    `Nhắc công nợ tới hạn: ${data.groups.length} nhóm (khách × mốc) tới mốc nhắc, gửi ${sent} thư, ${skippedNoEmail} khách thiếu email, nhắc ${notifiedMissingDueDate} NVKD điền hạn thanh toán.`
  );
  return { checked: data.groups.length, sent, skippedNoEmail, notifiedMissingDueDate };
}
