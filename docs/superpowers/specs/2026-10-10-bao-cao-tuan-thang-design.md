# Báo cáo tuần / tháng (xuất Excel dashboard) — thiết kế

Duyệt: anh Quân, 10/10/2026. Trang mới "Báo cáo" trên menu; chọn Tuần hoặc Tháng + kỳ; tải file Excel.

## Chỉ số (dùng đúng định nghĩa các trang hiện có để số khớp)

| Chỉ số | Cách tính | Nguồn |
|---|---|---|
| Doanh số đơn hàng | Tổng G.Trị PO theo ngày đặt PO (`poDate`) trong kỳ | `PoTrackingLine` |
| Doanh số đi hàng | Tổng giá trị các đợt giao thật có `eventDate` trong kỳ | `PoDeliveryEvent` |
| Đơn hàng / Đi hàng sản xuất | Như trên, chỉ dòng có mã hàng bắt đầu `SI` hoặc `SB` (dòng không có mã hàng không phân loại được) | như trên |
| OIH | Giá trị còn lại của mọi PO đang mở — số tại lúc xuất file, không tính ngược quá khứ | `getPoAggregates` |
| Chỉ tiêu doanh số + % hoàn thành | Chỉ báo cáo tháng | `SalesTarget` |
| Khách hàng mới | Khách có `createdAt` trong kỳ, theo NVKD phụ trách; kèm danh sách | `Customer` |
| Công nợ | Tổng nợ, quá hạn, tỉ lệ quá hạn, nợ xấu, nợ chưa có hạn, số HĐ chưa có lịch thanh toán + tiền, số HĐ còn nợ — chốt cuối ngày cuối kỳ (kỳ chưa kết thúc: hiện tại) | `DebtInvoice` + allocation |
| Kế hoạch thu | Kế hoạch (tổng `originalAmount` HĐ có ngày dự kiến trong kỳ), đã thu (allocation có ngày về trong kỳ), tỉ lệ; theo tuần; tổng tiền về trong kỳ (toàn công ty) | như Công nợ |

So sánh: kỳ hiện tại, kỳ -1, kỳ -2 (tháng: 2 tháng trước; tuần Thứ 2–Chủ nhật: 2 tuần trước) và % tăng giảm, áp dụng cho các chỉ số nhiều kỳ (doanh số, OIH hiện tại không so sánh, KH mới, chỉ tiêu). Công nợ / kế hoạch thu / OIH chỉ có kỳ hiện tại.

"Cả phòng" = tổng các nhân viên bán hàng (`includeInSalesStats`, có mã AMIS, đang hoạt động) — như trang Tổng quan; riêng công nợ "Cả phòng" = toàn bộ hoá đơn (như trang Công nợ).

## Phân quyền
ADMIN: Cả phòng + từng nhân viên. SALES: chỉ chính mình (không có dòng Cả phòng).

## File Excel
Sheet Dashboard (ô chọn Nhân viên + Chỉ số, công thức SUMIFS lên sheet Dữ liệu, thanh dữ liệu, % tăng giảm tô màu), Dữ liệu (bảng thô, lọc được), Công nợ (tổng hợp + HĐ quá hạn), Kế hoạch thu (tuần × nhân viên), Khách hàng mới, Cách tính.
Thư viện ExcelJS không tạo biểu đồ gốc nên dùng thanh dữ liệu/tô màu.

## Kỹ thuật
- `lib/report-period.ts`: tính kỳ (tháng/tuần) + 2 kỳ trước.
- `lib/debt-snapshot.ts`: hàm dùng chung tính công nợ chốt cuối kỳ (tách từ `/api/debt/summary`, route đó gọi lại hàm này) + kế hoạch thu theo nhân viên.
- `lib/report-metrics.ts`: gom dữ liệu thành bảng phẳng nhân viên × chỉ số × kỳ.
- `lib/report-workbook.ts`: dựng workbook.
- `GET /api/reports/export?type=week|month&period=YYYY-Www|YYYY-MM`; trang `/reports`.
- Test: tính kỳ, gom chỉ số, đọc ngược file Excel; kiểm tra số trên dữ liệu thật so với trang Tổng quan.
