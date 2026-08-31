/**
 * Cảnh báo khách hàng có nguy cơ mất — dựa trên NHỊP ĐẶT HÀNG của chính từng khách, không dùng
 * một mốc "bao nhiêu ngày là mất khách" chung cho tất cả. Lý do: khách như WOOJEON đặt gần như
 * hằng ngày, im lặng 2 tuần đã là bất thường nghiêm trọng; trong khi khách khác vốn 3-4 tuần mới
 * đặt 1 lần thì 2 tuần là hoàn toàn bình thường. Một mốc chung sẽ vừa bỏ sót khách lớn vừa báo
 * động giả hàng loạt khách nhỏ.
 *
 * Cách tính (đã đối chiếu trên dữ liệu đơn hàng thật của phòng):
 *  1. Gộp các đơn ĐẶT CÙNG NGÀY thành 1 "lần đặt hàng" — khách lớn thường tách 1 lần mua thành
 *     nhiều đơn trong cùng ngày, nếu đếm từng đơn thì nhịp trung vị ra 1 ngày và mọi con số sau
 *     đó đều méo.
 *  2. "Nhịp thường lệ" (medianGapDays) = trung vị khoảng cách giữa các lần đặt. Dùng trung vị chứ
 *     không dùng trung bình để 1 kỳ nghỉ dài bất thường không kéo lệch toàn bộ.
 *  3. "Khoảng nghỉ dài nhất bình thường" (p90GapDays) = phân vị 90 của các khoảng cách đó.
 *  4. CHỈ cảnh báo khi số ngày im lặng vượt CẢ p90 của chính khách đó — chặn báo động giả với
 *     khách vốn có nhịp thất thường (đặt dồn rồi nghỉ dài). Đã kiểm chứng trên dữ liệu thật: điều
 *     kiện này loại đúng các trường hợp như khách vốn hay nghỉ 34 ngày mà mới im lặng 25 ngày,
 *     đồng thời KHÔNG loại mất trường hợp nguy cơ cao thật nào.
 *  5. Mức độ theo tỷ lệ (số ngày im lặng / nhịp thường lệ).
 *
 * Ngoài ra còn 1 nhóm cảnh báo riêng: khách VẪN đặt hàng nhưng giá trị sụt mạnh (DECLINING) —
 * kiểu mất khách âm thầm, không bị lộ ra qua số ngày im lặng.
 */

export type CustomerRiskLevel = "HIGH" | "MEDIUM" | "WATCH" | "DECLINING";

export interface CustomerOrderPoint {
  /** Ngày đặt hàng (đã bỏ phần giờ ở tầng gọi hoặc không, hàm tự chuẩn hoá về ngày). */
  orderDate: Date;
  totalValue: number;
}

export interface CustomerRiskInput {
  customerName: string;
  customerCode: string | null;
  employeeId: string | null;
  employeeName: string | null;
  orders: CustomerOrderPoint[];
}

export interface CustomerRiskResult {
  customerName: string;
  customerCode: string | null;
  employeeId: string | null;
  employeeName: string | null;
  level: CustomerRiskLevel;
  /** Số ngày kể từ lần đặt hàng gần nhất. */
  silentDays: number;
  /** Nhịp đặt hàng thường lệ (trung vị, tính theo ngày). */
  medianGapDays: number;
  /** Khoảng nghỉ dài nhất vẫn được coi là bình thường với khách này. */
  p90GapDays: number;
  /** silentDays / medianGapDays — càng cao càng bất thường so với chính khách đó. */
  ratio: number;
  /** Số lần đặt hàng (đã gộp đơn cùng ngày). */
  orderDayCount: number;
  orderCount: number;
  lastOrderDate: Date;
  /** Tổng giá trị đơn trong toàn bộ dữ liệu có được — "giá trị đang đặt lên bàn cân". */
  totalValue: number;
  /** Doanh số 90 ngày gần nhất và 90 ngày liền trước (để thấy xu hướng), null nếu chưa đủ dữ liệu. */
  recent90Value: number;
  previous90Value: number;
  /** % thay đổi giữa 2 kỳ 90 ngày — null khi kỳ trước không có dữ liệu để so. */
  trendPct: number | null;
}

const DAY_MS = 86_400_000;

/** Ngưỡng tối thiểu để 1 khách được đưa vào phân tích — dưới mức này chưa đủ dữ liệu để nói
 * khách "có nhịp" đặt hàng, mọi kết luận đều là đoán mò. */
export const MIN_ORDER_DAYS = 4;
/** Sàn tuyệt đối: dưới mốc này không cảnh báo dù tỷ lệ cao, tránh nhiễu với khách đặt hằng ngày
 * (nghỉ 3-4 ngày cuối tuần + lễ đã thành tỷ lệ 3-4 lần nhịp). */
export const MIN_SILENT_DAYS = 14;
/** Doanh số kỳ trước tối thiểu để xét cảnh báo "sụt giá trị" — khách quá nhỏ thì % sụt giảm
 * không có ý nghĩa quản trị, chỉ làm nhiễu danh sách. */
export const MIN_DECLINING_BASE_VALUE = 20_000_000;

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Phân vị theo phương pháp "nearest-rank": trả về giá trị mà ít nhất q% số quan sát nhỏ hơn hoặc
 * bằng nó. CỐ TÌNH không dùng nội suy tuyến tính vì phần lớn khách chỉ có 4-10 lần đặt hàng —
 * với mẫu nhỏ, nội suy cho ra con số THẤP HƠN khoảng nghỉ thật của khách (vd khách có các khoảng
 * nghỉ 2, 2, 2, 40 ngày thì nội suy ra 28,6 dù thực tế họ vốn nghỉ tới 40 ngày), khiến hệ thống
 * báo động giả đúng vào nhóm khách có ít dữ liệu nhất. Nearest-rank luôn trả về một khoảng nghỉ
 * CÓ THẬT trong lịch sử của khách đó, nên ngưỡng cảnh báo luôn giải thích được với người dùng.
 */
function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil(q * sortedAsc.length);
  return sortedAsc[Math.min(sortedAsc.length, Math.max(1, rank)) - 1];
}

function median(sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 0;
  const mid = Math.floor(sortedAsc.length / 2);
  return sortedAsc.length % 2 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

/**
 * Phân tích 1 khách hàng — trả null nếu khách không thuộc diện cảnh báo (chưa đủ dữ liệu, hoặc
 * vẫn đang đặt hàng đúng nhịp).
 *
 * `referenceDate` là mốc "hôm nay" để tính số ngày im lặng — truyền vào thay vì dùng thẳng
 * new Date() để hàm thuần, test được, và để tầng gọi có thể xử lý trường hợp dữ liệu đồng bộ
 * bị cũ (xem getCustomerRiskList).
 */
export function analyzeCustomerRisk(input: CustomerRiskInput, referenceDate: Date): CustomerRiskResult | null {
  const { orders } = input;
  if (orders.length === 0) return null;

  // Gộp đơn cùng ngày -> "lần đặt hàng"
  const dayKeys = Array.from(new Set(orders.map((o) => toDayKey(o.orderDate)))).sort();
  if (dayKeys.length < MIN_ORDER_DAYS) return null;

  const dayTimes = dayKeys.map((k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  });

  const gaps: number[] = [];
  for (let i = 1; i < dayTimes.length; i++) {
    gaps.push((dayTimes[i] - dayTimes[i - 1]) / DAY_MS);
  }
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGapDays = median(sortedGaps);
  const p90GapDays = percentile(sortedGaps, 0.9);

  const lastTime = dayTimes[dayTimes.length - 1];
  const refDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()).getTime();
  const silentDays = Math.max(0, Math.round((refDay - lastTime) / DAY_MS));
  const ratio = medianGapDays > 0 ? silentDays / medianGapDays : 0;

  const valueBetween = (fromDaysAgo: number, toDaysAgo: number): number =>
    orders
      .filter((o) => {
        const age = (refDay - o.orderDate.getTime()) / DAY_MS;
        return age >= toDaysAgo && age < fromDaysAgo;
      })
      .reduce((sum, o) => sum + o.totalValue, 0);

  const recent90Value = valueBetween(90, 0);
  const previous90Value = valueBetween(180, 90);
  const trendPct = previous90Value > 0 ? ((recent90Value - previous90Value) / previous90Value) * 100 : null;

  // Điều kiện nền: im lặng đủ lâu về tuyệt đối VÀ vượt cả khoảng nghỉ dài nhất bình thường của
  // chính khách này.
  const abnormalSilence = silentDays >= MIN_SILENT_DAYS && silentDays > p90GapDays;

  let level: CustomerRiskLevel | null = null;
  if (abnormalSilence && ratio >= 3) level = "HIGH";
  else if (abnormalSilence && ratio >= 2) level = "MEDIUM";
  else if (abnormalSilence && ratio >= 1.5) level = "WATCH";
  else if (trendPct != null && trendPct <= -50 && previous90Value >= MIN_DECLINING_BASE_VALUE) level = "DECLINING";

  if (!level) return null;

  return {
    customerName: input.customerName,
    customerCode: input.customerCode,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    level,
    silentDays,
    medianGapDays: Math.round(medianGapDays * 10) / 10,
    p90GapDays: Math.round(p90GapDays * 10) / 10,
    ratio: Math.round(ratio * 100) / 100,
    orderDayCount: dayKeys.length,
    orderCount: orders.length,
    lastOrderDate: new Date(lastTime),
    totalValue: orders.reduce((sum, o) => sum + o.totalValue, 0),
    recent90Value,
    previous90Value,
    trendPct: trendPct == null ? null : Math.round(trendPct),
  };
}

const LEVEL_RANK: Record<CustomerRiskLevel, number> = { HIGH: 0, MEDIUM: 1, WATCH: 2, DECLINING: 3 };

/** Sắp theo mức độ nghiêm trọng trước, trong cùng mức thì khách giá trị lớn lên đầu — để người
 * đọc xử lý theo đúng thứ tự ưu tiên kinh doanh, không phải theo thứ tự bảng chữ cái. */
export function sortCustomerRisks(rows: CustomerRiskResult[]): CustomerRiskResult[] {
  return [...rows].sort(
    (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.totalValue - a.totalValue
  );
}

export const RISK_LEVEL_LABEL: Record<CustomerRiskLevel, string> = {
  HIGH: "Nguy cơ cao",
  MEDIUM: "Cảnh báo",
  WATCH: "Cần theo dõi",
  DECLINING: "Sụt giá trị",
};

export const RISK_LEVEL_NOTE: Record<CustomerRiskLevel, string> = {
  HIGH: "Im lặng gấp từ 3 lần nhịp đặt hàng thường lệ — cần liên hệ ngay trong tuần này.",
  MEDIUM: "Im lặng gấp 2-3 lần nhịp thường lệ — nên chủ động gọi hỏi kế hoạch đặt hàng.",
  WATCH: "Im lặng gấp 1,5-2 lần nhịp thường lệ — theo dõi thêm, chưa cần hành động gấp.",
  DECLINING: "Vẫn đặt hàng nhưng giá trị 90 ngày gần nhất giảm từ một nửa trở lên so với kỳ trước.",
};
