# Build từ context = gốc monorepo: docker build -f apps/web/Dockerfile .
# (đã cấu hình sẵn trong infra/docker-compose.yml)

FROM node:22-alpine AS base

# ---------- deps: cài node_modules cho toàn bộ workspace ----------
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm ci

# ---------- builder: build packages/db (prisma generate) + apps/web ----------
FROM base AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runner: image production tối giản ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Alpine không có sẵn openssl — Prisma cần nó ở runtime để nhận diện đúng
# bản OpenSSL và nạp đúng file engine (linux-musl-openssl-3.0.x), thiếu nó
# Prisma sẽ đoán nhầm sang engine cũ build cho OpenSSL 1.1 và lỗi khi load.
RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next.js standalone output giữ nguyên cấu trúc monorepo (apps/web/...)
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

RUN mkdir -p ./apps/web/public/uploads && chown -R nextjs:nodejs ./apps/web/public/uploads

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
