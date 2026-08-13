# Hoàng Gia CRM — Quản lý phòng kinh doanh

Web app nội bộ cho phòng kinh doanh Công ty CP Giải pháp Đóng gói Hoàng Gia:
quản lý đơn hàng (import từ AMIS), số hoá phiếu đi hàng bằng ảnh + AI, theo dõi công nợ
(đồng bộ từ congno.hienvi.me), và dashboard kế hoạch kinh doanh vs thực hiện + cảnh báo
đơn hàng quá hạn.

## Kiến trúc

- `apps/web` — Next.js 14 (App Router, TypeScript, Tailwind), toàn bộ UI + API routes.
- `apps/worker` — service Node riêng, dùng Playwright để đồng bộ công nợ từ congno.hienvi.me
  theo lịch (cron) hoặc theo yêu cầu thủ công.
- `packages/db` — Prisma schema + client dùng chung giữa web và worker.
- `infra` — Docker Compose, cấu hình Nginx/Certbot cho production trên Hostinger VPS.

Xem chi tiết kiến trúc/luồng xử lý trong plan gốc của dự án (mục Kiến trúc tổng quan,
Data model, Ba luồng xử lý trọng tâm).

## Chạy local (development)

Yêu cầu: Node ≥ 20, một PostgreSQL đang chạy (khuyên dùng Docker Desktop — xem bên dưới).

```bash
npm install
```

### Cách nhanh nhất để có Postgres local: Docker Desktop

Cài Docker Desktop, sau đó:

```bash
cd infra
cp .env.example .env   # điền POSTGRES_* tuỳ ý cho local, các biến khác có thể để trống
docker compose up -d postgres
```

### Cấu hình biến môi trường

- `apps/web/.env.local` — xem các biến cần trong `infra/.env.example` (DATABASE_URL,
  NEXTAUTH_SECRET, NEXTAUTH_URL, ANTHROPIC_API_KEY, ANTHROPIC_MODEL, INTERNAL_SYNC_TOKEN,
  WORKER_INTERNAL_URL).
- `apps/worker/.env` — DATABASE_URL, WORKER_PORT, INTERNAL_SYNC_TOKEN, và các biến
  HIENVI_* (để trống HIENVI_USERNAME sẽ tự chạy ở chế độ mock — sinh dữ liệu giả để test).

### Migrate schema + seed dữ liệu mẫu

```bash
npm run prisma:migrate   # tạo bảng theo schema
npm run db:seed          # tạo 1 admin + vài nhân viên mẫu + vài đơn hàng mẫu
```

Tài khoản mặc định sau khi seed: `admin@hoanggia.local` / `hoanggia@123` (đổi mật khẩu
ngay khi có dữ liệu thật).

### Chạy dev server

```bash
npm run dev            # web tại http://localhost:3000
npm run dev:worker      # worker (đồng bộ công nợ) tại http://localhost:4001
```

### Test

```bash
npm run test --workspace=apps/web       # unit test (không cần DB)
npm run test:e2e --workspace=apps/web   # e2e smoke test (cần DB đã seed + dev server chạy)
```

## Deploy

### 1. Đưa code lên GitHub

```bash
git init
git add .
git commit -m "Initial commit — Hoàng Gia CRM"
git branch -M main
git remote add origin <URL_REPO_GITHUB_CUA_ANH>
git push -u origin main
```

### 2. Chuẩn bị Hostinger VPS

- Cài Docker + Docker Compose plugin trên VPS (Hostinger hỗ trợ cài qua script chính thức
  của Docker: `curl -fsSL https://get.docker.com | sh`).
- Trỏ domain về IP của VPS (bản ghi A).
- Copy thư mục `infra/` lên VPS (hoặc `git clone` cả repo rồi `cd infra`).
- `cp .env.example .env` rồi điền đầy đủ giá trị thật (xem chú thích trong file).
- Sửa `YOUR_DOMAIN` trong `infra/nginx/conf.d/app.conf` thành domain thật.

### 3. Lấy chứng chỉ SSL lần đầu (bootstrap)

Nginx cần chứng chỉ mới chạy được cấu hình HTTPS, nhưng certbot cần Nginx chạy để xác thực
domain — nên cần chạy 2 bước:

```bash
# Bước 1: tạm comment khối "server { listen 443 ... }" trong app.conf, chỉ giữ khối 80
docker compose up -d nginx
docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d YOUR_DOMAIN
# Bước 2: bỏ comment lại khối 443, rồi khởi động toàn bộ
docker compose up -d
```

### 4. Chạy migration + tạo tài khoản admin đầu tiên

```bash
docker compose exec web npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
docker compose exec web npm run db:seed --workspace=packages/db
```

### 5. Deploy tự động từ GitHub Actions (tuỳ chọn)

Thêm các repo secret trong GitHub (Settings → Secrets and variables → Actions):
`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (private key SSH), `VPS_DEPLOY_PATH` (đường dẫn
thư mục `infra` trên VPS). Sau đó chạy workflow **Deploy to Hostinger VPS** thủ công từ
tab Actions, hoặc đổi trigger trong `.github/workflows/deploy.yml` sang `push: branches:
[main]` để tự động deploy mỗi lần merge.

## Đồng bộ công nợ (congno.hienvi.me)

Worker tự động đăng nhập congno.hienvi.me hàng ngày (mặc định 06:30, chỉnh qua
`HIENVI_SYNC_CRON`). **Trước khi bật chế độ thật** (`HIENVI_MOCK_MODE=false` với
`HIENVI_USERNAME`/`HIENVI_PASSWORD` thật), cần xác nhận lại selector trong
`apps/worker/src/scraper/selectors.ts` bằng `npx playwright codegen
https://congno.hienvi.me/login` vì lúc thiết kế chưa truy cập được trang (yêu cầu đăng
nhập). Nếu đăng nhập tự động thất bại (site đổi giao diện, thêm captcha...), dùng nút
"Đồng bộ thủ công" trên trang Công nợ hoặc kiểm tra log tại `SyncLog` trong DB.

## Ghi chú bảo mật

- Không commit bất kỳ file `.env*` thật nào (đã chặn qua `.gitignore`).
- `HIENVI_USERNAME`/`HIENVI_PASSWORD` chỉ tồn tại trong `infra/.env` trên VPS.
- Ảnh phiếu đi hàng lưu trong volume Docker `web_uploads`, không public ra ngoài ngoài
  domain chính của app.
