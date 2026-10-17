import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { isSystemAdmin } from "./rbac";
import { canSeeNavItem } from "@/components/layout/Sidebar";

describe("mức quyền tài khoản quản trị", () => {
  it("chỉ ADMIN mức FULL là quản trị hệ thống", () => {
    expect(isSystemAdmin({ user: { role: "ADMIN", accessLevel: "FULL" } })).toBe(true);
    expect(isSystemAdmin({ user: { role: "ADMIN", accessLevel: "OPERATOR" } })).toBe(false);
    expect(isSystemAdmin({ user: { role: "ADMIN", accessLevel: "VIEWER" } })).toBe(false);
    expect(isSystemAdmin({ user: { role: "SALES", accessLevel: "FULL" } })).toBe(false);
    expect(isSystemAdmin(null)).toBe(false);
  });
  it("menu Nhân viên chỉ hiện với quản trị hệ thống; menu thường hiện với mọi người", () => {
    const users = { adminOnly: true };
    expect(canSeeNavItem(users, "ADMIN", "FULL")).toBe(true);
    expect(canSeeNavItem(users, "ADMIN", "OPERATOR")).toBe(false);
    expect(canSeeNavItem(users, "ADMIN", "VIEWER")).toBe(false);
    expect(canSeeNavItem(users, "SALES", "FULL")).toBe(false);
    expect(canSeeNavItem({ adminOnly: false }, "SALES", "FULL")).toBe(true);
  });
});
