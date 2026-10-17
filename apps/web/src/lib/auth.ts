import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@hoanggia/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Ứng dụng chạy sau reverse proxy (Traefik/Nginx) trên VPS, không phải Vercel
  // — Auth.js v5 mặc định chặn mọi Host header không phải Vercel để chống tấn
  // công Host header giả mạo. Ta tin cậy Host vì Traefik đã terminate TLS và
  // forward đúng Host thật của domain đã cấu hình (không mở cổng app ra ngoài
  // trực tiếp, chỉ qua proxy).
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mật khẩu", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          accessLevel: user.accessLevel,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: "ADMIN" | "SALES" }).role;
        token.accessLevel = (user as { accessLevel: "FULL" | "OPERATOR" | "VIEWER" }).accessLevel;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "SALES";
        // Phiên đăng nhập cũ (trước khi có mức quyền) không có accessLevel — middleware buộc đăng nhập lại.
        session.user.accessLevel = token.accessLevel as "FULL" | "OPERATOR" | "VIEWER";
      }
      return session;
    },
  },
});
