import { describe, it, expect } from "vitest";
import { analyzeCustomerRisk, sortCustomerRisks, type CustomerRiskInput } from "./customer-risk";

const REF = new Date(2026, 7, 31); // 31/08/2026

/** Dựng khách hàng đặt hàng vào các ngày cách hôm nay N ngày (daysAgo), mỗi lần 1 đơn. */
function customer(daysAgoList: number[], value = 10_000_000, name = "KHÁCH TEST"): CustomerRiskInput {
  return {
    customerName: name,
    customerCode: null,
    employeeId: "emp1",
    employeeName: "NV Test",
    orders: daysAgoList.map((d) => ({
      orderDate: new Date(REF.getFullYear(), REF.getMonth(), REF.getDate() - d),
      totalValue: value,
    })),
  };
}

describe("analyzeCustomerRisk — nhịp đặt hàng", () => {
  it("không cảnh báo khách vẫn đặt hàng đúng nhịp", () => {
    // Đặt đều mỗi 7 ngày, lần cuối cách đây 5 ngày -> bình thường
    const result = analyzeCustomerRisk(customer([5, 12, 19, 26, 33, 40]), REF);
    expect(result).toBeNull();
  });

  it("báo NGUY CƠ CAO khi im lặng gấp >=3 lần nhịp thường lệ", () => {
    // Nhịp 7 ngày, im lặng 35 ngày -> tỷ lệ 5
    const result = analyzeCustomerRisk(customer([35, 42, 49, 56, 63]), REF);
    expect(result).not.toBeNull();
    expect(result!.level).toBe("HIGH");
    expect(result!.silentDays).toBe(35);
    expect(result!.medianGapDays).toBe(7);
    expect(result!.ratio).toBe(5);
  });

  it("báo CẢNH BÁO ở mức 2-3 lần nhịp thường lệ", () => {
    // Nhịp 10 ngày, im lặng 22 ngày -> tỷ lệ 2,2
    const result = analyzeCustomerRisk(customer([22, 32, 42, 52, 62]), REF);
    expect(result!.level).toBe("MEDIUM");
  });

  it("báo CẦN THEO DÕI ở mức 1,5-2 lần nhịp thường lệ", () => {
    // Nhịp 10 ngày, im lặng 17 ngày -> tỷ lệ 1,7
    const result = analyzeCustomerRisk(customer([17, 27, 37, 47, 57]), REF);
    expect(result!.level).toBe("WATCH");
  });

  it("KHÔNG cảnh báo khách vốn có nhịp thất thường khi kỳ im lặng vẫn nằm trong mức bình thường của họ", () => {
    // Khách đặt dồn rồi nghỉ dài: các khoảng cách 2,2,2,40 ngày -> trung vị 2 nhưng vẫn hay nghỉ 40
    // ngày. Im lặng 30 ngày: tỷ lệ tới 15 lần trung vị NHƯNG chưa vượt p90 -> không báo động giả.
    const result = analyzeCustomerRisk(customer([30, 32, 34, 36, 76]), REF);
    expect(result).toBeNull();
  });

  it("KHÔNG cảnh báo khách đặt hằng ngày chỉ vì nghỉ vài ngày cuối tuần/lễ", () => {
    // Nhịp 1 ngày, im lặng 4 ngày -> tỷ lệ 4 nhưng chưa đủ sàn tuyệt đối 14 ngày
    const result = analyzeCustomerRisk(customer([4, 5, 6, 7, 8, 9, 10]), REF);
    expect(result).toBeNull();
  });

  it("VẪN cảnh báo khách đặt hằng ngày khi im lặng vượt sàn tuyệt đối", () => {
    // Nhịp 1 ngày, im lặng 16 ngày -> nguy cơ cao thật sự với khách tần suất cao
    const result = analyzeCustomerRisk(customer([16, 17, 18, 19, 20, 21]), REF);
    expect(result!.level).toBe("HIGH");
    expect(result!.silentDays).toBe(16);
  });

  it("bỏ qua khách chưa đủ số lần đặt hàng để xác định được nhịp", () => {
    expect(analyzeCustomerRisk(customer([60, 90, 120]), REF)).toBeNull();
  });

  it("gộp các đơn đặt CÙNG NGÀY thành 1 lần đặt hàng", () => {
    // 3 đơn cùng ngày x 4 mốc, cách nhau 10 ngày; im lặng 30 ngày
    const daysAgo = [30, 30, 30, 40, 40, 50, 50, 60, 60];
    const result = analyzeCustomerRisk(customer(daysAgo), REF);
    expect(result!.orderDayCount).toBe(4);
    expect(result!.orderCount).toBe(9);
    // Nhịp phải là 10 ngày (theo lần đặt), KHÔNG phải 0 ngày (theo từng đơn)
    expect(result!.medianGapDays).toBe(10);
  });
});

describe("analyzeCustomerRisk — sụt giá trị", () => {
  it("báo SỤT GIÁ TRỊ với khách vẫn đặt đều nhưng giá trị giảm quá nửa", () => {
    const input: CustomerRiskInput = {
      customerName: "KHÁCH SỤT",
      customerCode: null,
      employeeId: "emp1",
      employeeName: "NV Test",
      orders: [
        // Kỳ trước (90-180 ngày): 100 triệu
        { orderDate: new Date(2026, 2, 20), totalValue: 50_000_000 },
        { orderDate: new Date(2026, 3, 20), totalValue: 50_000_000 },
        // Kỳ gần (0-90 ngày): 20 triệu -> giảm 80%
        { orderDate: new Date(2026, 5, 20), totalValue: 10_000_000 },
        { orderDate: new Date(2026, 6, 20), totalValue: 5_000_000 },
        { orderDate: new Date(2026, 7, 20), totalValue: 5_000_000 },
      ],
    };
    const result = analyzeCustomerRisk(input, REF);
    expect(result!.level).toBe("DECLINING");
    expect(result!.trendPct).toBe(-80);
  });

  it("KHÔNG báo sụt giá trị với khách quá nhỏ (dưới ngưỡng giá trị tối thiểu)", () => {
    const input: CustomerRiskInput = {
      customerName: "KHÁCH NHỎ",
      customerCode: null,
      employeeId: "emp1",
      employeeName: "NV Test",
      orders: [
        { orderDate: new Date(2026, 2, 20), totalValue: 2_000_000 },
        { orderDate: new Date(2026, 3, 20), totalValue: 2_000_000 },
        { orderDate: new Date(2026, 5, 20), totalValue: 100_000 },
        { orderDate: new Date(2026, 6, 20), totalValue: 100_000 },
        { orderDate: new Date(2026, 7, 20), totalValue: 100_000 },
      ],
    };
    expect(analyzeCustomerRisk(input, REF)).toBeNull();
  });
});

describe("sortCustomerRisks", () => {
  it("sắp theo mức nghiêm trọng trước, cùng mức thì khách giá trị lớn lên đầu", () => {
    const high1 = analyzeCustomerRisk(customer([35, 42, 49, 56, 63], 5_000_000, "HIGH nhỏ"), REF)!;
    const high2 = analyzeCustomerRisk(customer([35, 42, 49, 56, 63], 90_000_000, "HIGH lớn"), REF)!;
    const watch = analyzeCustomerRisk(customer([17, 27, 37, 47, 57], 500_000_000, "WATCH rất lớn"), REF)!;
    const sorted = sortCustomerRisks([watch, high1, high2]);
    expect(sorted.map((r) => r.customerName)).toEqual(["HIGH lớn", "HIGH nhỏ", "WATCH rất lớn"]);
  });
});
