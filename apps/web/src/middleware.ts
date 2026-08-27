import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Bảo vệ toàn bộ route trừ /login, /api/auth, và static assets.
// /admin/*, /debt, /quotes chỉ ADMIN được vào — công nợ và báo giá là số liệu tổng của cả
// phòng, không gắn được theo từng nhân viên đăng nhập nên không cho SALES xem (chỉ xem số
// liệu của chính mình).
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isAdmin = req.auth?.user?.role === "ADMIN";

  const isPublic = pathname === "/login";
  if (isPublic) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/", req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if ((pathname.startsWith("/admin") || pathname.startsWith("/debt") || pathname.startsWith("/quotes")) && !isAdmin) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // api/internal/* dùng x-internal-token riêng (gọi từ worker, không có phiên đăng nhập) — loại
  // trừ khỏi middleware giống api/auth, để route tự kiểm tra token qua requireInternalToken().
  matcher: ["/((?!api/auth|api/internal|_next/static|_next/image|favicon.ico|icon.svg|logo|images).*)"],
};
