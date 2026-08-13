import { test, expect } from "@playwright/test";

// Smoke test — chạy trước mỗi lần deploy thật. Cần DB đã chạy `npm run db:seed`
// (tài khoản mặc định: admin@hoanggia.local / hoanggia@123).

test("trang login hiển thị đúng thương hiệu", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("HOÀNG GIA")).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeVisible();
});

test("admin đăng nhập và thấy đủ menu chính", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("ban@hoanggia.local").fill("admin@hoanggia.local");
  await page.getByPlaceholder("••••••••").fill("hoanggia@123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page).toHaveURL("/");
  for (const label of ["Tổng quan", "Đơn hàng", "Phiếu đi hàng", "Công nợ", "Kế hoạch kinh doanh", "Nhân viên"]) {
    await expect(page.getByRole("link", { name: label })).toBeVisible();
  }
});

test("sales đăng nhập không thấy menu Nhân viên (admin-only)", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("ban@hoanggia.local").fill("tan@hoanggia.local");
  await page.getByPlaceholder("••••••••").fill("hoanggia@123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Nhân viên" })).toHaveCount(0);
});
