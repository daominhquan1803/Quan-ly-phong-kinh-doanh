import { prisma } from "@hoanggia/db";
import {
  analyzeCustomerRisk,
  sortCustomerRisks,
  type CustomerRiskInput,
  type CustomerRiskResult,
} from "./customer-risk";

export interface CustomerRiskReport {
  rows: CustomerRiskResult[];
  /** Ngày đặt hàng mới nhất trong toàn hệ thống — dùng để người đọc biết dữ liệu tính đến lúc nào. */
  latestOrderDate: Date | null;
  /** Số ngày dữ liệu đơn hàng đang chậm so với hôm nay. Đồng bộ AMIS chạy hằng ngày nên bình
   * thường là 0-2 ngày (cuối tuần khách không đặt hàng); nếu con số này lớn tức là đồng bộ đang
   * lỗi và MỌI cảnh báo bên dưới đều bị thổi phồng thêm đúng bằng ngần ấy ngày — cảnh báo rõ cho
   * người đọc thay vì để họ hoảng vì một loạt báo động giả. */
  dataLagDays: number;
  /** Tổng số khách hàng đã đưa vào phân tích (đủ số lần đặt tối thiểu). */
  analyzedCustomerCount: number;
}

/**
 * Danh sách khách hàng có nguy cơ mất, phạm vi theo quyền: SALES chỉ thấy khách của chính mình,
 * ADMIN thấy tất cả (hoặc lọc theo 1 nhân viên).
 *
 * Gom khách theo customerName vì đây là khoá chung duy nhất đáng tin giữa các nguồn dữ liệu
 * (customerCode có đơn có đơn không) — cùng cách gom đã dùng cho "khách hàng mới/cũ" ở
 * lib/week-plan.ts, giữ nhất quán toàn hệ thống.
 */
export async function getCustomerRiskReport(options: {
  onlyEmployeeId?: string;
}): Promise<CustomerRiskReport> {
  // LUÔN đọc đơn hàng của TOÀN CÔNG TY, không lọc theo nhân viên ngay từ truy vấn — việc lọc chỉ
  // áp ở bước cuối, theo người ĐANG phụ trách khách.
  //
  // Lý do (đã phát hiện qua dữ liệu thật khi kiểm thử): khách được bàn giao giữa các NVKD sẽ trông
  // như "đã ngừng mua hàng" nếu chỉ nhìn trong phạm vi 1 nhân viên. Ví dụ thật: Panasonic Hưng Yên
  // do anh Quân phụ trách tới 28/06 rồi bàn giao cho chị Dung — khách vẫn đặt đều đặn vài ngày 1
  // lần tới 17/08, nhưng phạm vi riêng của anh Quân lại báo "im lặng 63 ngày, nguy cơ cao, 713
  // triệu". Cảnh báo kiểu đó khiến NVKD gọi hỏi khách "sao ngừng đặt hàng" trong khi khách vẫn mua
  // bình thường — sai nghiêm trọng và làm mất niềm tin vào toàn bộ tính năng. Nhịp đặt hàng là đặc
  // tính của KHÁCH với CÔNG TY, không phải với từng nhân viên.
  const orders = await prisma.order.findMany({
    where: {
      orderDate: { not: null },
      // Đơn đã huỷ không thể hiện nhu cầu mua hàng thật -> không dùng để dựng nhịp đặt hàng.
      status: { not: "CANCELLED" },
    },
    select: {
      customerName: true,
      customerCode: true,
      orderDate: true,
      totalValue: true,
      salesEmployeeId: true,
      salesEmployee: { select: { id: true, name: true } },
    },
    orderBy: { orderDate: "asc" },
  });

  if (orders.length === 0) {
    return { rows: [], latestOrderDate: null, dataLagDays: 0, analyzedCustomerCount: 0 };
  }

  const byCustomer = new Map<string, CustomerRiskInput>();
  for (const o of orders) {
    if (!o.orderDate) continue;
    let entry = byCustomer.get(o.customerName);
    if (!entry) {
      entry = {
        customerName: o.customerName,
        customerCode: o.customerCode,
        employeeId: o.salesEmployeeId,
        employeeName: o.salesEmployee?.name ?? null,
        orders: [],
      };
      byCustomer.set(o.customerName, entry);
    }
    // Nhân viên phụ trách lấy theo đơn GẦN NHẤT (orders đã sắp tăng dần) — khách có thể được
    // chuyển giao giữa các NVKD, người cần liên hệ là người đang phụ trách hiện tại.
    if (o.salesEmployee) {
      entry.employeeId = o.salesEmployeeId;
      entry.employeeName = o.salesEmployee.name;
    }
    if (o.customerCode) entry.customerCode = o.customerCode;
    entry.orders.push({ orderDate: o.orderDate, totalValue: Number(o.totalValue) });
  }

  const latestOrderDate = orders[orders.length - 1].orderDate!;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const latestDay = new Date(
    latestOrderDate.getFullYear(),
    latestOrderDate.getMonth(),
    latestOrderDate.getDate()
  );
  const dataLagDays = Math.max(0, Math.round((today.getTime() - latestDay.getTime()) / 86_400_000));

  const rows: CustomerRiskResult[] = [];
  let analyzedCustomerCount = 0;
  for (const input of byCustomer.values()) {
    // Phân quyền/lọc theo NGƯỜI ĐANG PHỤ TRÁCH khách (lấy từ đơn gần nhất toàn công ty ở trên) —
    // sau khi đã tính nhịp trên toàn bộ lịch sử mua hàng của khách.
    if (options.onlyEmployeeId && input.employeeId !== options.onlyEmployeeId) continue;

    const uniqueDays = new Set(
      input.orders.map((o) => `${o.orderDate.getFullYear()}-${o.orderDate.getMonth()}-${o.orderDate.getDate()}`)
    );
    if (uniqueDays.size >= 4) analyzedCustomerCount++;
    const result = analyzeCustomerRisk(input, today);
    if (result) rows.push(result);
  }

  return {
    rows: sortCustomerRisks(rows),
    latestOrderDate,
    dataLagDays,
    analyzedCustomerCount,
  };
}
