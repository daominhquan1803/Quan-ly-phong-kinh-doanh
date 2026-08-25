import { PrismaClient } from "@prisma/client";

// Tránh tạo nhiều PrismaClient khi Next.js hot-reload trong dev.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
export * from "./employee-match";
export * from "./po-delivery-sync";
export * from "./po-tracking-from-orders";
export * from "./quote-color";
