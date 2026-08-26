# Build từ context = gốc monorepo: docker build -f apps/worker/Dockerfile .
# Dùng image chính thức của Playwright — đã cài sẵn Chromium + toàn bộ thư viện hệ thống cần thiết,
# tránh lỗi thiếu .so khi tự cài Playwright trên VPS thường gặp.
FROM mcr.microsoft.com/playwright:v1.47.2-jammy AS base

# tzdata: image gốc không có sẵn múi giờ hệ thống — thiếu nó, biến môi trường TZ
# (đặt ở docker-compose.yml) bị Node.js/ICU âm thầm bỏ qua và server vẫn chạy giờ
# UTC, gây lệch ngày-tháng so với giờ Việt Nam trong các phép tính lịch/tuần.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*
ENV TZ=Asia/Ho_Chi_Minh

WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm ci

COPY . .
RUN npm run build --workspace=packages/db && npm run build --workspace=apps/worker

WORKDIR /repo/apps/worker
ENV NODE_ENV=production
RUN mkdir -p /app/debug

CMD ["node", "dist/index.js"]
