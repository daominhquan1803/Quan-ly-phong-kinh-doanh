#!/usr/bin/env bash
# Ghi tài khoản trang "Hoàng Gia Lệnh SX" vào .env của app rồi khởi động lại worker.
# Người có tài khoản tự chạy và tự gõ; mật khẩu không hiện lên màn hình, không đi qua ai khác.
set -euo pipefail
cd "$(dirname "$0")"

read -rp "Tên đăng nhập Lệnh SX: " user
read -rsp "Mật khẩu (không hiện khi gõ): " pass
echo
[ -n "$user" ] && [ -n "$pass" ] || { echo "Chưa nhập đủ, không đổi gì."; exit 1; }

# Giá trị trong nháy đơn được Docker Compose giữ nguyên ($, #, khoảng trắng); chỉ cần thoát dấu nháy đơn.
quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/\\\\'/g")"; }

umask 077
{ grep -vE '^LENHSX_(USER|PASSWORD)=' .env || true; echo "LENHSX_USER=$(quote "$user")"; echo "LENHSX_PASSWORD=$(quote "$pass")"; } > .env.new
cat .env.new > .env
rm -f .env.new

docker compose up -d worker
sleep 15
docker compose logs worker --since 1m | grep -i "lệnh sản xuất" || echo "Chưa thấy dòng đồng bộ trong log."
