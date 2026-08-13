import { OrderStatus } from "@hoanggia/db";
import { normalizeVN } from "./text-normalize";

const STATUS_TEXT_MAP: Record<string, OrderStatus> = {
  "moi": OrderStatus.NEW,
  "moi tao": OrderStatus.NEW,
  "da xac nhan": OrderStatus.CONFIRMED,
  "xac nhan": OrderStatus.CONFIRMED,
  "dang san xuat": OrderStatus.PRODUCING,
  "san xuat": OrderStatus.PRODUCING,
  "giao mot phan": OrderStatus.PARTIAL_DELIVERED,
  "giao 1 phan": OrderStatus.PARTIAL_DELIVERED,
  "da giao": OrderStatus.DELIVERED,
  "hoan thanh": OrderStatus.DELIVERED,
  "da huy": OrderStatus.CANCELLED,
  "huy": OrderStatus.CANCELLED,
};

export function mapStatusText(raw: string | null | undefined): OrderStatus {
  if (!raw) return OrderStatus.NEW;
  const key = normalizeVN(raw);
  return STATUS_TEXT_MAP[key] ?? OrderStatus.NEW;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "Mới",
  CONFIRMED: "Đã xác nhận",
  PRODUCING: "Đang sản xuất",
  PARTIAL_DELIVERED: "Giao một phần",
  DELIVERED: "Đã giao",
  CANCELLED: "Đã hủy",
};

export const OPEN_STATUSES: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.CONFIRMED,
  OrderStatus.PRODUCING,
  OrderStatus.PARTIAL_DELIVERED,
];

/** Đơn hàng được coi là quá hạn khi còn đang mở (chưa giao xong/chưa hủy) và đã qua ngày giao dự kiến. */
export function isOrderOverdue(order: {
  status: OrderStatus;
  expectedDeliveryDate: Date | string | null;
}): boolean {
  if (!order.expectedDeliveryDate) return false;
  if (!OPEN_STATUSES.includes(order.status)) return false;
  const due = new Date(order.expectedDeliveryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

/**
 * Số ngày còn lại tới hạn giao (âm nếu đã quá hạn). null nếu đơn không có ngày giao dự kiến.
 */
export function daysUntilDeadline(expectedDeliveryDate: Date | string | null): number | null {
  if (!expectedDeliveryDate) return null;
  const due = new Date(expectedDeliveryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** Đơn còn mở, chưa quá hạn, và sẽ đến hạn giao trong `withinDays` ngày tới. */
export function isUpcomingDeadline(
  order: { status: OrderStatus; expectedDeliveryDate: Date | string | null },
  withinDays: number
): boolean {
  if (!OPEN_STATUSES.includes(order.status)) return false;
  const days = daysUntilDeadline(order.expectedDeliveryDate);
  if (days === null) return false;
  return days >= 0 && days <= withinDays;
}
