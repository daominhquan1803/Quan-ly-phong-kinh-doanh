# Gợi ý khách khi đăng ký công tác và điểm gặp khách theo điểm dừng — thiết kế

Ngày: 31/10/2026. Người yêu cầu: anh Quân (ADMIN FULL).

## Mục tiêu

Khi một NVKD đăng ký công tác tại một tỉnh, cả phòng thấy chuyến đó và danh sách khách trong tỉnh cần gặp, để NVKD phụ trách khách tham gia hoặc nhờ người đi hộ, và NVKD nào gặp khách nào thì được điểm gặp khách đó.

## Quy tắc điểm gặp khách (theo từng điểm dừng)

- Mỗi điểm dừng mới có **người đi gặp** (NVKD) và danh sách **người hỗ trợ của điểm dừng đó** (hỗ trợ giao tiếp, kỹ thuật).
- Mỗi điểm dừng cộng **1 điểm gặp khách** cho người đi gặp và **1 điểm cho mỗi người hỗ trợ** của điểm dừng đó.
  Ví dụ: Tùng đăng ký chuyến 2 khách, khách 1 của Tùng (Tùng đi), khách 2 của Dung (Dung đi, Tùng hỗ trợ). Tùng được 2 điểm, Dung được 1 điểm. Người hỗ trợ cả 2 khách được 2 điểm.
- Người đi gặp riêng **không** là người hỗ trợ, trừ khi người đăng ký thêm người đó làm người hỗ trợ của điểm dừng.
- Điểm dừng mới chỉ tính khi chuyến đã duyệt và **chính điểm dừng đó có báo cáo** kết quả "gặp được". Chưa báo cáo thì chưa tính.
- Điểm dừng cũ (không có người đi gặp riêng) và chuyến đã đăng ký trước tính năng này giữ cách tính hiện nay (người đi chính cộng người hỗ trợ cả chuyến, điểm dừng chưa có kết quả vẫn tính). KPI và điểm tuần đã chốt không đổi.
- Một hàm chung `stopCreditEmployeeIds(chuyến, điểm dừng)` quyết định ai được tính điểm; KPI (`kpi-metrics`), báo cáo (`report-metrics`), kế hoạch tuần (`week-plan`: khách cũ, số chuyến, kiểm tra "KH mới hẹn gặp được", chi tiết) và `customer-care-plan` đều gọi hàm này để không lệch nhau.

## Dữ liệu

- `BusinessTripRequest.provinces String[]` — tỉnh/TP của chuyến (bắt buộc với chuyến mới, chuyến cũ để trống).
- `BusinessTripStop`: thêm `customerId String?` (khách được chọn từ danh sách), `attendeeId String?` (người đi gặp; null = điểm dừng cũ), `addedById String?` (ai thêm).
- Bảng mới `BusinessTripStopSupporter` (`stopId`, `employeeId`) — người hỗ trợ của từng điểm dừng. Người hỗ trợ cấp chuyến (`BusinessTripSupporter`) giữ nguyên cho chuyến cũ; form mới thay bằng chọn theo từng điểm dừng.
- Người được chọn làm người đi gặp hoặc người hỗ trợ chỉ nhận thông báo, **không cần xác nhận**.
- Migration chỉ thêm cột và bảng.

## Form đăng ký công tác

- Thêm ô **Tỉnh/TP** (chọn một hoặc nhiều).
- Mỗi khách: chọn khách từ danh sách khách (gõ tên có gợi ý, vẫn gõ tay được), **NVKD đi gặp** (mặc định là người phụ trách khách đó, đổi sang NVKD khác = đi hộ; khách chưa phân thì chọn ai cũng được) và **người hỗ trợ** (chọn nhiều).
- Người đăng ký có thể đăng ký cho NVKD khác trong cùng chuyến.

## Bảng thông báo chung (đầu trang Đăng ký công tác)

- Mỗi chuyến chưa qua ngày đi, chưa bị từ chối hoặc huỷ: một dòng "Ngày 02/11 · Ngô Thanh Tùng đi công tác tại Hưng Yên · gợi ý N khách". Bấm mở bảng khách gợi ý: khách (kèm địa chỉ), NVKD phụ trách (hoặc "Chưa phân"), chưa mua X ngày, chưa chăm sóc Y ngày, nút thao tác. Số ngày lấy từ `getCareOverview` (`lastOrderAt`, `lastCareAt`).
- Khách gợi ý: cùng tỉnh (tỉnh hồ sơ khách, thiếu thì suy từ địa chỉ), có đơn trong 24 tháng, kể cả khách chưa phân NVKD. Loại khách của người đi chính và khách đã là điểm dừng. Xếp theo chưa chăm sóc lâu nhất, tối đa 15.
- Nút:
  - **Tham gia chuyến công tác** (chủ khách): thêm điểm dừng, người đi gặp = mình.
  - **Nhờ đi hộ** (chủ khách): chọn NVKD khác làm người đi gặp, người đó nhận thông báo.
  - **Nhận khách** (khách chưa phân): người bấm được gán làm người phụ trách khách và là người đi gặp điểm dừng đó.
  - Admin bấm được tất cả. Rút lại được trước ngày đi. Chuyến đã qua ngày đi thì không thêm được.
- Mỗi NVKD có khách trong tỉnh nhận một thông báo gộp qua chuông khi chuyến được đăng ký.

## Báo cáo và duyệt

- Báo cáo điểm dừng: người đi gặp nộp báo cáo của điểm dừng mình; chủ đăng ký và admin nộp được cho mọi điểm dừng. Chuyến chuyển "chờ duyệt" khi mọi điểm dừng đã có báo cáo; admin duyệt như cũ.
- Điểm dừng mới chưa có báo cáo thì chưa tính điểm (khác điểm dừng cũ).

## Làm theo thứ tự (mỗi bước deploy riêng)

1. Trường tỉnh, bảng thông báo và bảng khách gợi ý (chỉ xem).
2. Form đăng ký: người đi gặp và người hỗ trợ theo điểm dừng; hàm `stopCreditEmployeeIds` và đổi cách tính ở KPI, báo cáo, kế hoạch tuần.
3. Báo cáo điểm dừng theo người đi gặp.
4. Nút "Tham gia", "Nhờ đi hộ", "Nhận khách", thông báo gộp.

## Không làm

- Người được chọn xác nhận hoặc từ chối.
- Đề xuất giờ khác, hẹn giờ riêng cho từng khách.
- Đổi cách tính điểm của chuyến cũ.

## Kiểm thử

- Test thuần cho `stopCreditEmployeeIds` (ví dụ Tùng và Dung, điểm dừng cũ, điểm dừng chưa báo cáo).
- Test cho hàm chọn và xếp khách gợi ý (đúng tỉnh, loại khách đã là điểm dừng, thứ tự, khách chưa phân).
- Test API: tham gia, nhờ đi hộ, nhận khách (đúng quyền, đúng hạn, không nhận khách đã có chủ), nộp báo cáo theo người đi gặp.
- Test hồi quy: KPI và kế hoạch tuần với chuyến cũ cho kết quả không đổi.
