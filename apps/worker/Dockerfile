# Build từ context = gốc monorepo: docker build -f apps/worker/Dockerfile .
# Dùng image chính thức của Playwright — đã cài sẵn Chromium + toàn bộ thư viện hệ thống cần thiết,
# tránh lỗi thiếu .so khi tự cài Playwright trên VPS thường gặp.
FROM mcr.microsoft.com/playwright:v1.47.2-jammy AS base

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
