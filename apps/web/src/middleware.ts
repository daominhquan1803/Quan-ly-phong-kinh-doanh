import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Bảo vệ toàn bộ route trừ /login, /api/auth, và static assets.
// Chỉ /admin/* (trang Nhân viên) là của quản trị hệ thống; mọi trang khác NVKD đều xem + dùng được. /debt cho cả SALES xem — API đã tự
// giới hạn theo salesEmployeeId (scopeByOwner trong lib/rbac.ts): SALES chỉ thấy công nợ của
// chính mình, ADMIN thấy toàn phòng — /customers, /picking-slips cũng theo cách đó.
//
// Mức quyền tài khoản ADMIN (User.accessLevel, anh Quân chốt 17/10/2026): FULL = quản trị hệ thống; OPERATOR = Admin kinh doanh
// (không vào được trang Nhân viên; các API riêng của quản trị hệ thống tự chặn bằng requireSystemAdmin); VIEWER = chỉ xem —
// chặn MỌI thao tác ghi qua API ngay tại đây, trừ vài việc cá nhân (đọc thông báo, đổi mật khẩu, liên kết Zalo, đăng xuất).
const VIEWER_ALLOWED_WRITES = ["/api/notifications", "/api/push", "/api/zalo", "/api/account"];
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const user = req.auth?.user;
  const isAdmin = user?.role === "ADMIN";
  const isApi = pathname.startsWith("/api/");

  const isPublic = pathname === "/login";
  if (isPublic) {
    if (isLoggedIn && user?.accessLevel) {
      return NextResponse.redirect(new URL("/", req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    if (isApi) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Phiên đăng nhập tạo trước khi có mức quyền: xoá phiên, bắt đăng nhập lại 1 lần để nhận đúng quyền.
  if (!user?.accessLevel) {
    const res = isApi
      ? NextResponse.json({ error: "Phiên đăng nhập đã cũ, hãy đăng nhập lại" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", req.nextUrl));
    for (const c of SESSION_COOKIES) res.cookies.delete(c);
    return res;
  }

  if (
    isApi &&
    user.accessLevel === "VIEWER" &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !VIEWER_ALLOWED_WRITES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.json({ error: "Tài khoản chỉ có quyền xem" }, { status: 403 });
  }

  if (pathname.startsWith("/admin") && !(isAdmin && user.accessLevel === "FULL")) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // api/internal/* dùng x-internal-token riêng (gọi từ worker, không có phiên đăng nhập) — loại
  // trừ khỏi middleware giống api/auth, để route tự kiểm tra token qua requireInternalToken().
  // manifest.json/sw.js/icons/* PHẢI luôn truy cập công khai không cần đăng nhập — trình duyệt/hệ
  // điều hành tự tải các file này để đánh giá "có cài được PWA không" và để chạy service worker
  // nền (nhận push) mà không đi qua phiên đăng nhập nào cả; chặn chúng bằng middleware khiến
  // Chrome nhận về trang HTML redirect thay vì JSON/JS thật, làm app không cài lên máy được.
  // api/zalo/webhook: Zalo gọi vào, tự xác thực bằng header X-Bot-Api-Secret-Token.
  matcher: [
    "/((?!api/auth|api/internal|api/zalo/webhook|_next/static|_next/image|favicon.ico|icon.svg|logo|images|manifest.json|sw.js|icons).*)",
  ],
};
