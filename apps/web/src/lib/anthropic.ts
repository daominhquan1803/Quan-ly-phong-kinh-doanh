import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Thiếu ANTHROPIC_API_KEY — không thể dùng tính năng AI đọc ảnh phiếu.");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export interface OcrShipmentSlipItem {
  itemCode?: string;
  itemName: string;
  warehouse?: string;
  poSaleNumber?: string;
  unit?: string;
  qtyRequested?: number;
  qtyActual?: number;
  poCustomerItemCode?: string;
  note?: string;
}

export interface OcrShipmentSlipResult {
  slipNumber?: string;
  slipDate?: string;
  receiverName?: string;
  customerName?: string;
  deliveryAddress?: string;
  description?: string;
  paymentMethod?: string;
  preparedBy?: string;
  items: OcrShipmentSlipItem[];
  lowConfidenceFields: string[];
}

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "extract_shipment_slip",
  description: "Trích xuất dữ liệu từ ảnh phiếu xuất kho bán hàng (phiếu đi hàng) của Hoàng Gia Packaging.",
  input_schema: {
    type: "object",
    properties: {
      slipNumber: { type: "string", description: "Số phiếu, vd BH03070" },
      slipDate: { type: "string", description: "Ngày lập phiếu, định dạng YYYY-MM-DD nếu đọc được" },
      receiverName: { type: "string", description: "Người nhận hàng" },
      customerName: { type: "string", description: "Tên khách hàng / công ty nhận hàng" },
      deliveryAddress: { type: "string", description: "Địa chỉ giao hàng" },
      description: { type: "string", description: "Diễn giải nội dung phiếu" },
      paymentMethod: { type: "string", description: "Hình thức thanh toán" },
      preparedBy: { type: "string", description: "Người lập phiếu" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            itemCode: { type: "string" },
            itemName: { type: "string" },
            warehouse: { type: "string" },
            poSaleNumber: { type: "string", description: "Số PO bán" },
            unit: { type: "string", description: "Đơn vị tính" },
            qtyRequested: { type: "number", description: "Số lượng yêu cầu" },
            qtyActual: { type: "number", description: "Số lượng thực xuất" },
            poCustomerItemCode: { type: "string", description: "Số PO/Mã hàng KH" },
            note: { type: "string" },
          },
          required: ["itemName"],
        },
      },
      lowConfidenceFields: {
        type: "array",
        items: { type: "string" },
        description: "Tên các field mà mô hình không chắc chắn (chữ mờ/viết tay khó đọc/bị che khuất)",
      },
    },
    required: ["items", "lowConfidenceFields"],
  },
};

/**
 * Gửi ảnh phiếu đi hàng (base64 JPEG) cho Claude Vision, ép trả về đúng schema qua tool-use.
 */
export async function extractShipmentSlipFromImage(base64Jpeg: string): Promise<{
  result: OcrShipmentSlipResult;
  rawResponse: unknown;
}> {
  const anthropic = getClient();
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  const response = await anthropic.messages.create({
    model,
    max_tokens: 2048,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_shipment_slip" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg },
          },
          {
            type: "text",
            text:
              "Đây là ảnh chụp 'Phiếu xuất kho bán hàng' (phiếu đi hàng) của công ty Hoàng Gia Packaging. " +
              "Hãy đọc và trích xuất chính xác thông tin theo schema đã cho. Với mỗi dòng hàng hoá trong bảng, " +
              "lấy đủ mã hàng, tên hàng, kho, số PO bán, đơn vị tính, số lượng yêu cầu và số lượng thực xuất. " +
              "Nếu chữ viết tay hoặc mờ không chắc chắn, vẫn điền giá trị đọc được tốt nhất nhưng liệt kê tên field đó vào lowConfidenceFields.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    throw new Error("AI không trả về dữ liệu trích xuất hợp lệ. Vui lòng thử lại hoặc nhập tay.");
  }

  const result = toolUse.input as OcrShipmentSlipResult;
  if (!Array.isArray(result.items)) result.items = [];
  if (!Array.isArray(result.lowConfidenceFields)) result.lowConfidenceFields = [];

  return { result, rawResponse: response };
}
