/**
 * Xác nhận đơn hàng từ PKH/SX (anh Quân chốt 29/10/2026): Admin gửi đơn cho PKH/SX rồi phải bấm "Xác nhận" kèm ảnh chụp xác nhận trong vòng
 * 2 GIỜ LÀM VIỆC kể từ khi đơn được tạo trên AMIS. Quá hạn chưa xác nhận (hoặc xác nhận trễ) = lỗi đơn hàng do Admin (tính vào KPI Admin).
 *
 * Giờ làm việc: Thứ Hai–Thứ Bảy, 7h30–17h30 (giờ Việt Nam), Chủ nhật nghỉ. Đơn tạo ngoài giờ thì bắt đầu đếm từ 7h30 ngày làm việc kế tiếp.
 * Chỉ áp dụng cho đơn AMIS tạo từ CONFIRM_FROM; đơn huỷ và đơn giá trị 0 (hàng mẫu) không phải xác nhận.
 */
export const CONFIRM_FROM = new Date("2026-10-30T00:00:00+07:00");
export const CONFIRM_HOURS = 2;
const VN = 7 * 3600_000;
const DAY = 86_400_000;
const START_MIN = 7 * 60 + 30;
const END_MIN = 17 * 60 + 30;

/** Hạn xác nhận: cộng `hours` giờ LÀM VIỆC kể từ `created`. */
export function confirmDeadline(created: Date, hours: number = CONFIRM_HOURS): Date {
  let cur = created.getTime();
  let left = hours * 3600_000;
  for (let i = 0; i < 40 && left > 0; i++) {
    const t = new Date(cur + VN);
    const dayStart = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - VN;
    const min = t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60;
    if (t.getUTCDay() === 0 || min >= END_MIN) {
      cur = dayStart + DAY + START_MIN * 60_000;
      continue;
    }
    if (min < START_MIN) {
      cur = dayStart + START_MIN * 60_000;
      continue;
    }
    const avail = (END_MIN - min) * 60_000;
    if (left <= avail) return new Date(cur + left);
    left -= avail;
    cur = dayStart + DAY + START_MIN * 60_000;
  }
  return new Date(cur);
}

export type ConfirmState = "NA" | "PENDING" | "OVERDUE" | "ON_TIME" | "LATE" | "DONE";
export interface ConfirmInfo {
  state: ConfirmState;
  deadline?: Date;
  confirmedAt?: Date;
}

interface ConfirmInput {
  source: string;
  status: string;
  totalValue: number | string;
  amisCreatedAt: Date | string | null;
  confirmedAt: Date | string | null;
}

/** Đơn có phải xác nhận không (theo nguồn/trạng thái/giá trị/ngày tạo). */
export function needsConfirmation(o: Pick<ConfirmInput, "source" | "status" | "totalValue" | "amisCreatedAt">): boolean {
  if (o.source !== "AMIS_API" || o.status === "CANCELLED" || !o.amisCreatedAt || !(Number(o.totalValue) > 0)) return false;
  return new Date(o.amisCreatedAt) >= CONFIRM_FROM;
}

export function confirmInfo(o: ConfirmInput, now: Date = new Date()): ConfirmInfo {
  const confirmedAt = o.confirmedAt ? new Date(o.confirmedAt) : undefined;
  if (!needsConfirmation(o)) return confirmedAt ? { state: "DONE", confirmedAt } : { state: "NA" };
  const deadline = confirmDeadline(new Date(o.amisCreatedAt!));
  if (confirmedAt) return { state: confirmedAt <= deadline ? "ON_TIME" : "LATE", deadline, confirmedAt };
  return { state: now > deadline ? "OVERDUE" : "PENDING", deadline };
}

/** Lỗi đơn hàng do Admin: quá hạn mà chưa xác nhận, hoặc xác nhận trễ. */
export const isConfirmError = (i: ConfirmInfo) => i.state === "OVERDUE" || i.state === "LATE";
