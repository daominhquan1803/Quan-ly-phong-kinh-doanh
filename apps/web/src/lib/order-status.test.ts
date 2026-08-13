import { describe, it, expect } from "vitest";
import { OrderStatus } from "@hoanggia/db";
import { isOrderOverdue, mapStatusText, daysUntilDeadline, isUpcomingDeadline } from "./order-status";

describe("mapStatusText", () => {
  it("maps common Vietnamese status text to enum", () => {
    expect(mapStatusText("Đã xác nhận")).toBe(OrderStatus.CONFIRMED);
    expect(mapStatusText("Đang sản xuất")).toBe(OrderStatus.PRODUCING);
    expect(mapStatusText("Đã giao")).toBe(OrderStatus.DELIVERED);
    expect(mapStatusText("Đã hủy")).toBe(OrderStatus.CANCELLED);
  });

  it("defaults to NEW for unknown or empty text", () => {
    expect(mapStatusText(null)).toBe(OrderStatus.NEW);
    expect(mapStatusText("")).toBe(OrderStatus.NEW);
    expect(mapStatusText("Trạng thái lạ")).toBe(OrderStatus.NEW);
  });
});

describe("isOrderOverdue", () => {
  it("returns true when open order's delivery date has passed", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isOrderOverdue({ status: OrderStatus.CONFIRMED, expectedDeliveryDate: yesterday })).toBe(true);
  });

  it("returns false when delivery date is today or future", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isOrderOverdue({ status: OrderStatus.CONFIRMED, expectedDeliveryDate: tomorrow })).toBe(false);
    expect(isOrderOverdue({ status: OrderStatus.CONFIRMED, expectedDeliveryDate: new Date() })).toBe(false);
  });

  it("returns false for delivered or cancelled orders regardless of date", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isOrderOverdue({ status: OrderStatus.DELIVERED, expectedDeliveryDate: yesterday })).toBe(false);
    expect(isOrderOverdue({ status: OrderStatus.CANCELLED, expectedDeliveryDate: yesterday })).toBe(false);
  });

  it("returns false when there is no expected delivery date", () => {
    expect(isOrderOverdue({ status: OrderStatus.NEW, expectedDeliveryDate: null })).toBe(false);
  });
});

describe("daysUntilDeadline", () => {
  it("returns null when there is no deadline", () => {
    expect(daysUntilDeadline(null)).toBeNull();
  });

  it("returns a positive number of days for a future date", () => {
    const in3Days = new Date();
    in3Days.setDate(in3Days.getDate() + 3);
    expect(daysUntilDeadline(in3Days)).toBe(3);
  });

  it("returns a negative number of days for a past date", () => {
    const ago2Days = new Date();
    ago2Days.setDate(ago2Days.getDate() - 2);
    expect(daysUntilDeadline(ago2Days)).toBe(-2);
  });

  it("returns 0 for today", () => {
    expect(daysUntilDeadline(new Date())).toBe(0);
  });
});

describe("isUpcomingDeadline", () => {
  it("returns true when an open order's deadline falls within the window", () => {
    const in2Days = new Date();
    in2Days.setDate(in2Days.getDate() + 2);
    expect(isUpcomingDeadline({ status: OrderStatus.CONFIRMED, expectedDeliveryDate: in2Days }, 3)).toBe(true);
  });

  it("returns false when the deadline is beyond the window", () => {
    const in10Days = new Date();
    in10Days.setDate(in10Days.getDate() + 10);
    expect(isUpcomingDeadline({ status: OrderStatus.CONFIRMED, expectedDeliveryDate: in10Days }, 3)).toBe(false);
  });

  it("returns false for an order that is already overdue", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isUpcomingDeadline({ status: OrderStatus.CONFIRMED, expectedDeliveryDate: yesterday }, 3)).toBe(false);
  });

  it("returns false for a delivered order even if within the window", () => {
    const in1Day = new Date();
    in1Day.setDate(in1Day.getDate() + 1);
    expect(isUpcomingDeadline({ status: OrderStatus.DELIVERED, expectedDeliveryDate: in1Day }, 3)).toBe(false);
  });
});
