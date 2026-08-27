import nodemailer from "nodemailer";
import { logger } from "./logger";

// Gửi email thông báo qua SMTP (mặc định dùng Gmail — cần "Mật khẩu ứng dụng", không phải mật
// khẩu Gmail thường). Chưa cấu hình SMTP_USER/SMTP_PASSWORD thì bỏ qua gửi email, chỉ ghi log —
// KHÔNG ném lỗi, để không chặn phần thông báo trong app khi chưa có SMTP.
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || "Hoàng Gia CRM";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
if (SMTP_USER && SMTP_PASSWORD) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
}

export function isEmailConfigured(): boolean {
  return transporter !== null;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!transporter) {
    logger.warn(`Chưa cấu hình SMTP_USER/SMTP_PASSWORD — bỏ qua gửi email tới ${to}: "${subject}"`);
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"${SMTP_FROM_NAME}" <${SMTP_USER}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    logger.error(`Gửi email thất bại tới ${to}:`, err instanceof Error ? err.message : err);
    return false;
  }
}
