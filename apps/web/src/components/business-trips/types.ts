export type TripStatus = "PENDING" | "REPORTED" | "NEEDS_REVISION" | "APPROVED" | "REJECTED";
export type StopOutcome = "MET" | "NOT_MET" | "RESCHEDULED";

export interface StopRow extends StopPeople {
  id: string;
  orderIndex: number;
  companyName: string;
  address: string | null;
  expectedTime: string | null;
  content: string;
  // ----- báo cáo sau buổi gặp (null = chưa nộp / buổi cũ theo luồng cũ) -----
  outcome: StopOutcome | null;
  contactName: string | null;
  contactPhone: string | null;
  reportContent: string | null;
  productInterest: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  nextActionOwner: { id: string; name: string } | null;
  nextActionDoneAt: string | null;
  checkinLat: string | number | null;
  checkinLng: string | number | null;
  checkinAccuracyM: number | null;
  checkinAt: string | null;
  photos: { id: string }[];
}

/** Người đi gặp / người hỗ trợ của riêng 1 điểm dừng (điểm dừng cũ: attendee = null, tính cả chuyến như trước). */
export interface StopPeople {
  customerId?: string | null;
  attendee?: { id: string; name: string } | null;
  supporters?: { employee: { id: string; name: string } }[];
}

export interface TripRow {
  id: string;
  employee: { id: string; name: string };
  visitDate: string;
  /** Tỉnh/TP của chuyến (chuyến cũ để trống) */
  provinces: string[];
  status: TripStatus;
  approvedBy: { id: string; name: string } | null;
  rejectReason: string | null;
  reportedAt: string | null;
  supporters: { employee: { id: string; name: string } }[];
  stops: StopRow[];
  // Quá hạn đăng ký của tuần chứa ngày đi — NVKD không sửa/huỷ/nộp báo cáo được nữa, chỉ Quản trị viên.
  entryLocked?: boolean;
}

export interface PrefillStop {
  companyName: string;
  address: string;
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function todayVN(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Ngày đi (lưu UTC nửa đêm của ngày đã chọn) -> YYYY-MM-DD. */
export function visitDay(visitDate: string): string {
  return visitDate.slice(0, 10);
}
