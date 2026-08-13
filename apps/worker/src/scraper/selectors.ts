/**
 * Selector/URL cho congno.hienvi.me — CHƯA XÁC ĐỊNH ĐƯỢC vì trang yêu cầu đăng nhập
 * (thăm dò trả về 401 lúc thiết kế). Trước khi bật SCRAPE thật (HIENVI_MOCK_MODE=false),
 * chạy 1 lần: `npx playwright codegen https://congno.hienvi.me/login` với tài khoản thật
 * để lấy đúng selector rồi cập nhật file này.
 */
export const HIENVI_CONFIG = {
  baseUrl: process.env.HIENVI_BASE_URL || "https://congno.hienvi.me",
  loginPath: "/login",
  // TODO: xác nhận lại selector thật bằng playwright codegen
  usernameSelector: 'input[name="username"], input[type="text"]',
  passwordSelector: 'input[name="password"], input[type="password"]',
  submitSelector: 'button[type="submit"]',
  // Selector của 1 phần tử chỉ xuất hiện sau khi đăng nhập thành công (vd. menu dashboard)
  loggedInIndicatorSelector: 'text=Tổng quan, text=Dashboard, nav',
};
