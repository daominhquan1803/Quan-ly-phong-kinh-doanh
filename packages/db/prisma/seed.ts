import { PrismaClient, Role, OrderStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("hoanggia@123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@hoanggia.local" },
    update: {},
    create: {
      email: "admin@hoanggia.local",
      passwordHash,
      name: "Quản trị viên",
      role: Role.ADMIN,
    },
  });

  const salesNames = [
    { email: "tan@hoanggia.local", name: "Đặng Văn Tấn" },
    { email: "huong@hoanggia.local", name: "Nguyễn Thị Hương" },
    { email: "minh@hoanggia.local", name: "Trần Văn Minh" },
  ];

  const salesUsers = [];
  for (const s of salesNames) {
    const u = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        passwordHash,
        name: s.name,
        role: Role.SALES,
      },
    });
    salesUsers.push(u);
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  for (const [i, u] of salesUsers.entries()) {
    await prisma.salesTarget.upsert({
      where: { employeeId_year_month: { employeeId: u.id, year, month } },
      update: {},
      create: {
        employeeId: u.id,
        year,
        month,
        targetRevenue: 200_000_000 + i * 50_000_000,
      },
    });
  }

  const sampleOrders = [
    {
      orderCode: "DH-2026-0001",
      customerName: "CÔNG TY TNHH WOOJEON VINA",
      salesEmployeeId: salesUsers[0].id,
      salesEmployeeNameRaw: salesUsers[0].name,
      orderDate: new Date(now.getFullYear(), now.getMonth(), 1),
      expectedDeliveryDate: new Date(now.getFullYear(), now.getMonth(), 5),
      status: OrderStatus.DELIVERED,
      totalValue: 85_000_000,
      poCode: "G04435",
    },
    {
      orderCode: "DH-2026-0002",
      customerName: "CÔNG TY CP ARCO VINA",
      salesEmployeeId: salesUsers[1].id,
      salesEmployeeNameRaw: salesUsers[1].name,
      orderDate: new Date(now.getFullYear(), now.getMonth(), 3),
      expectedDeliveryDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2),
      status: OrderStatus.CONFIRMED,
      totalValue: 42_000_000,
      poCode: "G04501",
    },
    {
      orderCode: "DH-2026-0003",
      customerName: "CÔNG TY TNHH BLUECOM",
      salesEmployeeId: salesUsers[2].id,
      salesEmployeeNameRaw: salesUsers[2].name,
      orderDate: new Date(now.getFullYear(), now.getMonth(), 6),
      expectedDeliveryDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5),
      status: OrderStatus.PRODUCING,
      totalValue: 63_500_000,
      poCode: "G04512",
    },
  ];

  for (const o of sampleOrders) {
    await prisma.order.upsert({
      where: { orderCode: o.orderCode },
      update: {},
      create: o,
    });
  }

  console.log("Seed hoàn tất:", {
    admin: admin.email,
    salesUsers: salesUsers.map((u) => u.email),
    orders: sampleOrders.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
