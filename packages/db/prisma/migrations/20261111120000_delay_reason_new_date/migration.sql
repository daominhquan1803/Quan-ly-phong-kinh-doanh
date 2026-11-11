-- Ngày khách hẹn mới khi lý do trễ là "Khách đổi lịch" (chỉ tính khi Trưởng phòng đã duyệt)
ALTER TABLE "delivery_delay_reasons" ADD COLUMN "newDeliveryDate" TIMESTAMP(3);
