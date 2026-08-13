import { describe, it, expect } from "vitest";
import { OrderStatus } from "@hoanggia/db";
import { isOrderOverdue, mapStatusText } from "./order-status";

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
