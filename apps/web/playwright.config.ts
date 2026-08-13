import { defineConfig } from "@playwright/test";

// Chạy: npm run test:e2e (cần DB đã seed và dev server đang chạy ở :3000)
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
  },
  reporter: [["list"]],
});
