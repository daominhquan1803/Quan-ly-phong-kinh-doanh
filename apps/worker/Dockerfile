# Build từ context = gốc monorepo: docker build -f apps/worker/Dockerfile .
# Trước đây dùng image Playwright (cần Chromium để scrape congno.hienvi.me) — đã bỏ module
# công nợ đồng bộ hienvi.me, worker không còn dùng Playwright, chuyển về image alpine nhẹ như
# apps/web/Dockerfile.
FROM node:22-alpine AS base

# openssl: Prisma cần để nhận diện đúng bản OpenSSL và nạp đúng engine (linux-musl-openssl-3.0.x).
# tzdata: Alpine không có sẵn múi giờ hệ thống — thiếu nó, biến môi trường TZ (đặt ở
# docker-compose.yml) bị Node.js/ICU âm thầm bỏ qua và server vẫn chạy giờ UTC, gây lệch ngày-tháng
# so với giờ Việt Nam trong các phép tính lịch/tuần.
RUN apk add --no-cache openssl tzdata libc6-compat
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
