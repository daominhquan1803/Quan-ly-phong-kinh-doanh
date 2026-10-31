/** Lọc bảng "Cần thu tuần này" (trang Công nợ) theo nhân viên / khách hàng / tình trạng — chạy trên danh sách đã tải, không gọi API. */
export interface FollowUpFilterable {
  employeeName: string;
  customerCode: string;
  kind: "planned" | "slipped";
  slippedWeeks: number;
}

export interface FollowUpFilter {
  employee: string;
  customer: string;
  /** "" = tất cả; "planned" hoặc "slipped-<số tuần>" */
  status: string;
}

export const statusKey = (i: Pick<FollowUpFilterable, "kind" | "slippedWeeks">) => (i.kind === "planned" ? "planned" : `slipped-${i.slippedWeeks}`);
export const statusLabel = (key: string) => (key === "planned" ? "Kế hoạch tuần" : `Trượt ${key.split("-")[1]} tuần`);

/** Các tình trạng đang có: Kế hoạch tuần trước, rồi trượt từ ít đến nhiều tuần. */
export function statusOptions(rows: Pick<FollowUpFilterable, "kind" | "slippedWeeks">[]): string[] {
  return Array.from(new Set(rows.map(statusKey))).sort((a, b) => (a === "planned" ? -1 : b === "planned" ? 1 : Number(a.split("-")[1]) - Number(b.split("-")[1])));
}

export function filterFollowUp<T extends FollowUpFilterable>(rows: T[], f: FollowUpFilter): T[] {
  return rows.filter((i) => (!f.employee || i.employeeName === f.employee) && (!f.customer || i.customerCode === f.customer) && (!f.status || statusKey(i) === f.status));
}
