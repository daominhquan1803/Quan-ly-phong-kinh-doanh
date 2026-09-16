import { z } from "zod";

// Dùng chung cho tạo mới (POST /api/business-trips) lẫn sửa lại khi gõ nhầm (PATCH action
// "update" /api/business-trips/[id]) — tách riêng file lib vì route.ts của Next.js App Router
// KHÔNG được export gì khác ngoài GET/POST/... và vài config cố định (dynamic, revalidate...),
// export thêm 1 schema từ route.ts làm build production lỗi ("not a valid Route export field").
export const stopSchema = z.object({
  companyName: z.string().trim().min(1, "Thiếu tên công ty đến gặp"),
  address: z.string().trim().max(500).optional().nullable(),
  expectedTime: z.string().trim().max(20).optional().nullable(),
  content: z.string().trim().min(1, "Thiếu nội dung buổi gặp"),
});
