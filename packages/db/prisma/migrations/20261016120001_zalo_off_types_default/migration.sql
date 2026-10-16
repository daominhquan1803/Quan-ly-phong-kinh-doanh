-- Cột mảng thêm bằng ADD COLUMN không default nên các dòng cũ là NULL; đặt mặc định mảng rỗng.
UPDATE "users" SET "zaloOffTypes" = ARRAY[]::"NotificationType"[] WHERE "zaloOffTypes" IS NULL;
ALTER TABLE "users" ALTER COLUMN "zaloOffTypes" SET DEFAULT ARRAY[]::"NotificationType"[];
