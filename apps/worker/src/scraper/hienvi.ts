import { prisma } from "@hoanggia/db";
import { chromium } from "playwright";
import { logger } from "../logger";
import { HIENVI_CONFIG } from "./selectors";

export interface DebtRow {
  customerName: string;
  customerCode?: string;
  totalDebt: number;
  overdueDebt: number;
  agingBuckets: Record<string, number>;
}

export interface SyncOutcome {
  status: "SUCCESS" | "FAILED";
  recordsSynced: number;
  message?: string;
}

const MOCK_MODE = process.env.HIENVI_MOCK_MODE === "true" || !process.env.HIENVI_USERNAME;

/**
 * Chạy 1 lần đồng bộ công nợ từ congno.hienvi.me, ghi DebtSnapshot + SyncLog.
 * Ở MOCK_MODE (chưa có credential thật, hoặc HIENVI_MOCK_MODE=true), sinh dữ liệu giả
 * để test luồng ghi DB mà không cần đăng nhập trang thật.
 */
export async function runDebtSync(triggeredBy: string): Promise<SyncOutcome> {
  const syncLog = await prisma.syncLog.create({
    data: { jobType: "DEBT_SYNC", status: "RUNNING", triggeredBy },
  });

  try {
    const rows = MOCK_MODE ? mockDebtRows() : await scrapeDebtRows();
    const snapshotDate = new Date();
    snapshotDate.setHours(0, 0, 0, 0);

    await prisma.$transaction(
      rows.map((row) =>
        prisma.debtSnapshot.create({
          data: {
            snapshotDate,
            customerName: row.customerName,
            customerCode: row.customerCode,
            totalDebt: row.totalDebt,
            overdueDebt: row.overdueDebt,
            agingBuckets: row.agingBuckets,
            source: "HIENVI",
          },
        })
      )
    );

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        recordsSynced: rows.length,
        message: MOCK_MODE ? "Mock mode — dữ liệu giả để test luồng ghi DB" : undefined,
      },
    });

    logger.info(`Đồng bộ công nợ thành công: ${rows.length} khách hàng${MOCK_MODE ? " (mock)" : ""}`);
    return { status: "SUCCESS", recordsSynced: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    logger.error("Đồng bộ công nợ thất bại:", message);
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: "FAILED", finishedAt: new Date(), message },
    });
    return { status: "FAILED", recordsSynced: 0, message };
  }
}

function mockDebtRows(): DebtRow[] {
  const customers = [
    "CÔNG TY TNHH WOOJEON VINA",
    "CÔNG TY CP ARCO VINA",
    "CÔNG TY TNHH BLUECOM",
  ];
  return customers.map((name, i) => ({
    customerName: name,
    totalDebt: 50_000_000 + i * 15_000_000,
    overdueDebt: i === 1 ? 12_000_000 : 0,
    agingBuckets: { "0-30": 20_000_000, "31-60": 10_000_000, "61-90": 0, ">90": i === 1 ? 12_000_000 : 0 },
  }));
}

/**
 * Đăng nhập congno.hienvi.me và lấy dữ liệu công nợ thật.
 * CHƯA XÁC MINH ĐƯỢC SELECTOR THẬT — xem ghi chú trong selectors.ts.
 * Ưu tiên bắt response JSON nội bộ của trang (ổn định hơn khi UI đổi nhỏ); nếu không có,
 * fallback đọc bảng HTML bằng selector chung (rất dễ cần chỉnh lại theo giao diện thật).
 */
async function scrapeDebtRows(): Promise<DebtRow[]> {
  const username = process.env.HIENVI_USERNAME;
  const password = process.env.HIENVI_PASSWORD;
  if (!username || !password) {
    throw new Error("Thiếu HIENVI_USERNAME/HIENVI_PASSWORD trong biến môi trường của worker");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();

    // Bắt các response JSON nghi là API nội bộ trả dữ liệu công nợ, phòng khi DOM scraping
    // không khớp — log lại để dev xem xét khi cấu hình lần đầu.
    const capturedJson: unknown[] = [];
    page.on("response", async (res) => {
      const contentType = res.headers()["content-type"] || "";
      if (contentType.includes("application/json") && /debt|cong-no|congno|receivable/i.test(res.url())) {
        try {
          capturedJson.push(await res.json());
        } catch {
          /* bỏ qua response không parse được */
        }
      }
    });

    await page.goto(`${HIENVI_CONFIG.baseUrl}${HIENVI_CONFIG.loginPath}`, { waitUntil: "networkidle" });
    await page.fill(HIENVI_CONFIG.usernameSelector, username);
    await page.fill(HIENVI_CONFIG.passwordSelector, password);
    await page.click(HIENVI_CONFIG.submitSelector);

    await page.waitForSelector(HIENVI_CONFIG.loggedInIndicatorSelector, { timeout: 15_000 }).catch(async () => {
      await page.screenshot({ path: `/app/debug/hienvi-login-fail-${Date.now()}.png` }).catch(() => {});
      throw new Error("Đăng nhập congno.hienvi.me thất bại hoặc giao diện đã thay đổi (không thấy dấu hiệu đăng nhập thành công)");
    });

    if (capturedJson.length > 0) {
      logger.info(`Bắt được ${capturedJson.length} response JSON nghi là dữ liệu công nợ — cần map thủ công vào DebtRow[].`);
      // TODO: map capturedJson theo cấu trúc thật của API nội bộ khi xác định được.
    }

    // Fallback: đọc bảng HTML đầu tiên trên trang — CẦN CHỈNH LẠI theo cấu trúc bảng thật.
    const rows = await page.$$eval("table tbody tr", (trs) =>
      trs.map((tr) => {
        const cells = Array.from(tr.querySelectorAll("td")).map((td) => td.textContent?.trim() ?? "");
        return cells;
      })
    );

    if (rows.length === 0) {
      throw new Error("Không tìm thấy bảng dữ liệu công nợ trên trang — cần cập nhật lại selector trong selectors.ts");
    }

    return rows
      .filter((cells) => cells[0])
      .map((cells) => ({
        customerName: cells[0],
        totalDebt: parseVNNumber(cells[1]),
        overdueDebt: parseVNNumber(cells[2]),
        agingBuckets: {},
      }));
  } finally {
    await browser.close();
  }
}

function parseVNNumber(value?: string): number {
  if (!value) return 0;
  const n = Number(value.replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
