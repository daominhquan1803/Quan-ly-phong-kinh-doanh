# Đổi lỗi theo biên bản hàng lỗi — thiết kế

Ngày: 31/10/2026. Người yêu cầu: anh Quân (ADMIN FULL).

## Mục tiêu

Khi có hàng lỗi, Admin lập biên bản hàng lỗi (đã có). Khi giao hàng đổi lỗi cho khách, Phiếu đi hàng phải nối được với biên bản đó và làm biên bản tiến tới hoàn thành. Trường hợp khách không đổi mà trừ vào hàng đã giao (huỷ tại kho khách, trừ công nợ) thì biên bản hoàn thành ngay.

## Phân biệt hai loại hàng không có PO

| Loại | Ý nghĩa | Xử lý |
|---|---|---|
| Hàng đổi lỗi | Giao theo biên bản hàng lỗi | Nối với biên bản, cộng dồn SL đổi, đủ thì đóng biên bản |
| Hàng bù hao | Hàng tặng khách, không liên quan hàng lỗi | Bỏ qua (`issueIgnored`), không Số PO, không tính doanh số |

Cả hai đều không tính doanh số vì không có đợt giao khớp PO (`PoDeliveryEvent`).

## Dữ liệu

- `DefectReport`: thêm `resolutionType` (enum `DefectResolutionType`: `REPLACED`, `DESTROYED_DEDUCT_DEBT`, `OTHER`, nullable) và `deductAmount` (`Decimal(18,2)`, nullable). Giữ nguyên `resolution`, `invoiceAdjusted`, `adjustedInvoiceNumbers`, `invoiceAdjustNote`.
- Bảng mới `DefectReplacement` (`defect_replacements`): `id`, `defectReportId`, `defectReportItemId`, `shipmentSlipItemId`, `quantity` (`Decimal(14,2)`), `confirmedById`, `confirmedAt`. Index theo `defectReportId`, `shipmentSlipItemId`. Xoá biên bản thì xoá theo (`onDelete: Cascade`). Xoá dòng phiếu thì xoá theo.
- Số đã đổi của một mã hàng lỗi = tổng `quantity` của các `DefectReplacement` thuộc mã đó. Mã đủ khi số đã đổi >= `defectQty`.
- Migration chỉ thêm cột và bảng. Biên bản cũ giữ nguyên.

## Luồng

1. **Gợi ý.** Dòng phiếu không có Số PO được so với các mã hàng lỗi của biên bản `OPEN` còn thiếu. Khớp khi cùng khách (mã khách, nếu thiếu thì tên khách) và cùng mã hàng (bỏ hậu tố `.N` bằng `stripItemCodeVersionSuffix`). Dòng phiếu đã đổi hết SL của nó thì không gợi ý lại.
2. **Bảng trên Phiếu đi hàng (Admin).** Mở rộng bảng "Dòng phiếu cần sửa": dòng không PO có hai nút.
   - "Đổi lỗi theo biên bản": chọn biên bản đang mở (gợi ý sẵn nếu khớp), nhập SL đổi (mặc định = min(SL thực xuất, phần còn thiếu)), xác nhận.
   - "Hàng tặng / bù hao": bỏ qua như hiện tại.
3. **Xác nhận đổi lỗi.** Tạo `DefectReplacement`, đánh dấu dòng phiếu `issueIgnored = true` (hết cảnh báo thiếu PO, không tính doanh số). Nếu mọi mã hàng lỗi của biên bản đã đủ: `status = CLOSED`, `resolutionType = REPLACED`, `closedAt` = ngày phiếu đổi lỗi (`slipDate` của phiếu có đợt đổi cuối cùng làm đủ), `closedById` = Admin xác nhận, `resolution` tự ghi "Đổi lỗi theo phiếu BHxxxx". Chưa đủ thì giữ `OPEN` và hiện tiến độ.
4. **Huỷ tại kho khách, trừ công nợ.** Form đóng biên bản có chọn loại xử lý. Chọn `DESTROYED_DEDUCT_DEBT` thì bắt buộc nhập `deductAmount` và `adjustedInvoiceNumbers` (đặt `invoiceAdjusted = true`). Lưu xong biên bản `CLOSED` ngay. App không tạo bút toán công nợ; kế toán điều chỉnh ở AMIS và công nợ giảm khi đồng bộ.
5. **Trang Hàng lỗi.** Hiện tiến độ đổi theo từng mã ("đã đổi 600/1.000"), danh sách phiếu đổi lỗi đã xác nhận và loại xử lý.

## API

- `GET /api/shipment-slips/issues`: trả thêm `defectSuggestions` cho mỗi dòng không PO (biên bản khớp, SL còn thiếu).
- `POST /api/shipment-slips/items/[id]/defect-replacement` (admin): body `{ defectReportId, defectReportItemId?, quantity }`. Kiểm tra biên bản đang mở, mã khớp, `0 < quantity`, không vượt quá SL thực xuất của dòng phiếu. Một giao dịch gồm tạo bản ghi, đánh dấu bỏ qua, kiểm tra và đóng biên bản.
- `PATCH /api/defects/[id]` (đóng biên bản): nhận thêm `resolutionType`, `deductAmount`, kiểm tra điều kiện của loại `DESTROYED_DEDUCT_DEBT`.

## Không làm

- Không tự đóng biên bản khi chưa có Admin xác nhận.
- Không tạo khoản trừ trong màn Công nợ.
- Không đổi cách tính doanh số.
- Không nối hàng bù hao với biên bản.

## Kiểm thử

- Test thuần cho hàm khớp gợi ý: cùng khách, cùng mã, hậu tố `.N`, nhiều biên bản, mã không khớp.
- Test cho điều kiện hoàn thành: đổi thiếu, đổi đủ nhiều lần, đổi dư.
- Test route xác nhận (quyền admin, vượt SL, biên bản đã đóng) và route đóng với `DESTROYED_DEDUCT_DEBT` thiếu tiền hoặc thiếu hoá đơn.

## Lưu ý

Nhập lại file Excel phiếu cùng số phiếu thay toàn bộ dòng hàng, nên dòng phiếu cũ (và `DefectReplacement` gắn với nó) bị xoá; Admin cần xác nhận lại.
