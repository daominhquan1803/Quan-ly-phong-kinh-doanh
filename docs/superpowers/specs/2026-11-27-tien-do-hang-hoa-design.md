# Theo dõi tiến độ hàng hoá — kế hoạch thực hiện

Ngày lập: 27/11/2026. Trạng thái: anh Quân đã duyệt 4 đợt (27/11/2026). Đợt 1 và đợt 2 đã viết code (đợt 2 làm ngay theo yêu cầu để mọi nhân viên xem được hàng của mình).

Đã chốt: mã đầu AA, ST là hàng thương mại; SI, SB, GC là hàng sản xuất. Đồng bộ dùng tài khoản trang sản xuất cấp cho anh Quân, anh tự nhập vào máy chủ bằng `infra/set-lenhsx.sh`.

## Mục tiêu

Ở trang Tiến độ giao hàng, mỗi dòng PO còn nợ hàng cho biết hàng đang ở đâu và có kịp hạn giao không.

## Kết quả khảo sát trang "Hoàng Gia Lệnh SX"

- Trang có API trả JSON. Dữ liệu lệnh sản xuất (LSX) nằm ở `/api/lsx`, đăng nhập bằng cookie.
- Mỗi LSX có: số lệnh, Số PO, mã hàng (có thể nhiều mã, nhiều PO), số lượng, ngày giao, cờ xong, ngày hoàn thành, cờ huỷ, công đoạn đã chạy, máy đang đứng, máy dự kiến, độ ưu tiên.
- Có 481 LSX: 312 đã xong, 7 đã huỷ, 162 chưa xong (4 đang chạy máy, 61 đã chạy một phần, 97 chưa chạy).
- LSX của phòng mình (PO mã DT, MQ, NT, PD): 232 lệnh chưa huỷ, 73 lệnh chưa xong. LSX của phòng khác app bỏ qua.
- Đối chiếu mẫu với dữ liệu thật: 35 lệnh của phòng mình đều khớp cả Số PO và mã hàng.
- Mã sản xuất trong LSX chỉ có đầu GC, SB, SI. Mã đầu AA, ST không xuất hiện (giả định là hàng thương mại, cần anh xác nhận).
- Cờ "đã đi" của trang sản xuất ít được dùng (11/481). Số đã giao phải lấy từ Phiếu đi hàng của app mình.
- "Dự kiến xong" không được lưu sẵn. Trang tự tính cho ngày mai theo công đoạn (Đóng gói 09:00, Cắt tờ 10:00, Xẻ - QC 12:00), trừ khi có ngày đặt tay.

## Cách làm

### Lấy dữ liệu

Worker đăng nhập bằng tài khoản chỉ xem, đọc `/api/lsx` mỗi 15 phút trong giờ làm việc. App chỉ đọc, không ghi sang trang sản xuất. App chỉ gọi `/api/lsx` và chỉ lưu các trường cần dùng, không lưu giá nguyên vật liệu.

Phương án tốt hơn nếu bên viết trang sản xuất hỗ trợ: cấp một API chỉ đọc kèm khoá. Phần còn lại của kế hoạch không đổi.

### Lưu và ghép

Thêm một bảng lưu bản sao các dòng LSX (mỗi mã hàng một dòng). Ghép với dòng PO của app theo Số PO + mã hàng, dùng lại cách bỏ hậu tố phiên bản mã đang có. Đồng bộ lỗi thì giữ số liệu cũ và hiện giờ cập nhật cuối.

### Trạng thái của một dòng PO còn nợ hàng

| Trạng thái | Điều kiện |
|---|---|
| Đã xong, chờ giao | LSX đã xong, dòng PO còn nợ |
| Đang sản xuất | Đang chạy máy hoặc đã qua ít nhất một công đoạn; hiện công đoạn đang đứng |
| Chờ sản xuất | Có LSX, chưa chạy công đoạn nào; hiện máy dự kiến |
| Chưa có lệnh sản xuất | Mã GC, SB, SI nhưng không tìm thấy LSX |
| Hàng thương mại | Mã AA, ST; chờ dữ liệu của PKH |
| PO cũ, chưa có dữ liệu SX | Mã sản xuất, không có LSX, PO đặt trước ngày lệnh sớm nhất trên trang sản xuất (12/10/2026). Không cảnh báo |

Một dòng PO có nhiều LSX thì lấy trạng thái chậm nhất.

### Cảnh báo

- Trễ: quá hạn giao mà chưa xong.
- Nguy cơ trễ: còn không quá 3 ngày mà chưa chạy công đoạn nào, hoặc chưa có LSX.
- Xong chưa giao: đã xong nhưng PO còn nợ.

### Màn hình

Trang Tiến độ giao hàng thêm tab "Tiến độ hàng hoá": thẻ đếm theo trạng thái và bảng gồm NVKD, khách, Số PO, mã hàng, SL còn nợ, hạn giao, trạng thái, số LSX, công đoạn, dự kiến xong. Có lọc và tìm kiếm. NVKD chỉ thấy đơn của mình.

## Các đợt làm

1. **Đồng bộ và đối chiếu.** Bảng mới, worker đọc LSX, báo cáo dòng không khớp. Anh kiểm tra số liệu thật trước khi sang đợt 2.
2. **Tab "Tiến độ hàng hoá".** Trạng thái, cảnh báo, lọc.
3. **Nhắc qua Zalo Bot.** Mỗi sáng gửi NVKD đơn trễ, nguy cơ trễ, xong chưa giao. Đã chốt: 8h, thứ Hai đến thứ Bảy; số đếm kèm 5 dòng gấp nhất; PO cũ không tính; số liệu sản xuất cũ quá 3 giờ thì không gửi.
4. **Hàng thương mại.** Làm khi PKH có công cụ. Dùng chung tab, thêm nguồn dữ liệu. Chưa thiết kế vì chưa biết dữ liệu.

Kiểm thử: test cho phần ghép mã và tính trạng thái; đối chiếu tay vài đơn với trang sản xuất sau khi đồng bộ.

## Rủi ro

- Bên sản xuất đổi cấu trúc dữ liệu hoặc cách đăng nhập thì đồng bộ dừng.
- Quy tắc "dự kiến xong" sao chép từ trang của họ. Họ đổi quy tắc thì app mình phải sửa theo.
- Chưa kiểm tra máy chủ của app có đăng nhập được vào trang sản xuất không. Kiểm tra ở đầu đợt 1.
- Số PO hoặc mã hàng ghi sai trên LSX thì dòng đó hiện "Chưa có lệnh sản xuất".

## Khi deploy đợt 1

`docker-compose.yml` trên máy chủ không được cập nhật khi deploy. Cần thêm `LENHSX_URL`, `LENHSX_USER`, `LENHSX_PASSWORD` cho dịch vụ worker trong `docker-compose.override.yml`, và chép `infra/set-lenhsx.sh` lên máy chủ.
