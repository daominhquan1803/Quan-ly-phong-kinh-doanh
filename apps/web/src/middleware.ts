import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Bảo vệ toàn bộ route trừ /login, /api/auth, và static assets.
// /admin/* và /debt chỉ ADMIN được vào — công nợ là số liệu tổng của cả phòng, không
// gắn được theo từng nhân viên nên không cho SALES xem (chỉ xem số liệu của chính mình).
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

  if ((pathname.startsWith("/admin") || pathname.startsWith("/debt")) && !isAdmin) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|logo).*)"],
};
