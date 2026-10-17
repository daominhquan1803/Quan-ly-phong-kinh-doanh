import { DefaultSession } from "next-auth";

type AccessLevel = "FULL" | "OPERATOR" | "VIEWER";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "SALES";
      /** Mức quyền của tài khoản ADMIN — xem enum AccessLevel trong schema.prisma. */
      accessLevel: AccessLevel;
    } & DefaultSession["user"];
  }

  interface User {
    role: "ADMIN" | "SALES";
    accessLevel: AccessLevel;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "SALES";
    accessLevel?: AccessLevel;
  }
}
