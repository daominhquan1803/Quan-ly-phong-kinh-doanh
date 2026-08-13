# Fixtures cho UAT (User Acceptance Testing)

Thư mục này để trống trong repo (không commit dữ liệu/ảnh thật của công ty). Trước khi
chạy UAT đầy đủ, anh cần thêm vào đây (chỉ trên máy local, không commit):

1. **`sample-order-export.xlsx`** — 1 file Excel xuất thật (hoặc vài dòng mẫu) từ
   AMIS CRM (Đơn hàng bán), dùng để test wizard import tại `/orders/import`.
2. **`sample-shipment-slip.jpg`** (hoặc `.pdf`) — 1 ảnh chụp hoặc file PDF phiếu xuất kho
   bán hàng thật, dùng để test luồng AI đọc phiếu (hệ thống chấp nhận cả 2 định dạng —
   PDF được render trang 1 thành ảnh trước khi gửi AI, xem `lib/pdf-to-image.ts`):

   ```bash
   cd apps/web
   npm run test:ocr -- ../../fixtures/sample-shipment-slip.jpg   # hoặc .pdf

   # Chỉ muốn test riêng bước PDF -> ảnh (không tốn phí AI):
   npx tsx scripts/test-pdf-render.ts ../../fixtures/sample-shipment-slip.pdf
   ```

   (cần `ANTHROPIC_API_KEY` hợp lệ trong `apps/web/.env.local` cho `test:ocr`)

## Vì sao chưa có sẵn dữ liệu mẫu ở đây

Ảnh phiếu đi hàng và cấu trúc Google Sheet anh gửi trong lúc trao đổi yêu cầu là ảnh
dán trực tiếp vào khung chat / link Google Sheet riêng tư — Claude không có quyền tải
file đính kèm chat xuống ổ đĩa hay mở Google Sheet riêng tư (trả về lỗi 401 khi thử
truy cập lúc lập kế hoạch). Vì vậy các trường dữ liệu của phiếu đi hàng (`ShipmentSlip`,
`ShipmentSlipItem` trong `packages/db/prisma/schema.prisma`) được thiết kế dựa trên đọc
thủ công nội dung ảnh anh gửi trong chat, chứ chưa được test bằng chính ảnh đó qua API.

## Checklist UAT đầy đủ (cần Postgres đang chạy — xem README.md gốc)

- [ ] `npm run prisma:migrate && npm run db:seed`
- [ ] Đăng nhập bằng `admin@hoanggia.local` / `hoanggia@123`
- [ ] Import `sample-order-export.xlsx` tại `/orders/import`, đối chiếu số dòng
      tạo mới/cập nhật với số dòng thật trong file
- [ ] Upload `sample-shipment-slip.jpg` tại `/shipment-slips/new`, đối chiếu từng
      trường AI đọc được với ảnh gốc, sửa lại nếu sai rồi lưu
- [ ] Vào `/targets`, đặt chỉ tiêu cho từng nhân viên, kiểm tra `/` (Tổng quan) tính
      đúng % hoàn thành
- [ ] Kiểm tra bảng "Đơn hàng quá hạn giao" ở Tổng quan chỉ hiện đúng các đơn có ngày
      giao dự kiến đã qua và chưa giao xong
- [ ] Bấm "Đồng bộ thủ công" ở `/debt` (worker đang ở mock mode nếu chưa có
      `HIENVI_USERNAME`) để xác nhận luồng ghi `DebtSnapshot` hoạt động
