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

  // Đội kinh doanh thật đang được quản lý trong hệ thống — mã AMIS đã xác nhận qua dữ
  // liệu đồng bộ thật (employee_code trên AMIS SaleOrders).
  const salesNames = [
    { email: "quan@hoanggia.local", name: "Đào Minh Quân", amisEmployeeCode: "MINHQUAN" },
    { email: "tan@hoanggia.local", name: "Đặng Văn Tấn", amisEmployeeCode: "DANGTAN" },
    { email: "tung@hoanggia.local", name: "Ngô Thanh Tùng", amisEmployeeCode: "THANHTUNG" },
    { email: "dung@hoanggia.local", name: "Phạm Thị Dung", amisEmployeeCode: "PHAMDUNG" },
  ];

  const salesUsers = [];
  for (const s of salesNames) {
    const u = await prisma.user.upsert({
      where: { email: s.email },
      update: { amisEmployeeCode: s.amisEmployeeCode },
      create: {
        email: s.email,
        passwordHash,
        name: s.name,
        role: Role.SALES,
        amisEmployeeCode: s.amisEmployeeCode,
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
      salesEmployeeId: salesUsers[1].id, // Đặng Văn Tấn
      salesEmployeeNameRaw: salesUsers[1].name,
      orderDate: new Date(now.getFullYear(), now.getMonth(), 1),
      expectedDeliveryDate: new Date(now.getFullYear(), now.getMonth(), 5),
      status: OrderStatus.DELIVERED,
      totalValue: 85_000_000,
      poCode: "G04435",
      items: [
        {
          lineOrder: 0,
          itemCode: "AA20012",
          itemName: "Pallet nhựa 1200x1000x120mm",
          unit: "Cái",
          quantity: 300,
          unitPrice: 200_000,
          totalPrice: 60_000_000,
          warehouse: "KHO T",
          poCustomerItemCode: "G04435",
        },
      ],
    },
    {
      orderCode: "DH-2026-0002",
      customerName: "CÔNG TY CP ARCO VINA",
      salesEmployeeId: salesUsers[0].id, // Đào Minh Quân
      salesEmployeeNameRaw: salesUsers[0].name,
      orderDate: new Date(now.getFullYear(), now.getMonth(), 3),
      expectedDeliveryDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2),
      status: OrderStatus.CONFIRMED,
      totalValue: 42_000_000,
      poCode: "G04501",
      items: [],
    },
    {
      orderCode: "DH-2026-0003",
      customerName: "CÔNG TY TNHH BLUECOM",
      salesEmployeeId: salesUsers[2].id, // Ngô Thanh Tùng
      salesEmployeeNameRaw: salesUsers[2].name,
      orderDate: new Date(now.getFullYear(), now.getMonth(), 6),
      expectedDeliveryDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5),
      status: OrderStatus.PRODUCING,
      totalValue: 63_500_000,
      poCode: "G04512",
      items: [],
    },
  ];

  for (const o of sampleOrders) {
    const { items, ...orderData } = o;
    const order = await prisma.order.upsert({
      where: { orderCode: o.orderCode },
      update: {},
      create: orderData,
    });
    if (items.length > 0) {
      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
      await prisma.orderItem.createMany({ data: items.map((it) => ({ ...it, orderId: order.id })) });
    }
  }

  console.log("Seed hoàn tất:", {
    admin: admin.email,
    salesUsers: salesUsers.map((u) => `${u.email} (${u.amisEmployeeCode})`),
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
