export interface DefectRow {
  id: string;
  reportNumber: string;
  reportDate: string;
  customerCode: string | null;
  customerName: string | null;
  deliveryDate: string | null;
  description: string;
  otherResponsible: string | null;
  status: "OPEN" | "CLOSED";
  closedAt: string | null;
  receivedAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  resolution: string | null;
  invoiceAdjusted: boolean | null;
  adjustedInvoiceNumbers: string | null;
  invoiceAdjustNote: string | null;
  resolutionType: "REPLACED" | "DESTROYED_DEDUCT_DEBT" | "OTHER" | null;
  deductAmount: string | null;
  replacements: { id: string; defectReportItemId: string; quantity: string; shipmentSlipItem: { shipmentSlip: { id: string; slipNumber: string; slipDate: string | null } } }[];
  shipmentSlip: { id: string; slipNumber: string; slipDate: string | null } | null;
  items: { id: string; slipItemId: string | null; itemCode: string | null; itemName: string; unit: string | null; deliveredQty: string | null; defectQty: string }[];
  responsibles: { user: { id: string; name: string; role: "ADMIN" | "SALES"; accessLevel: "FULL" | "OPERATOR" | "VIEWER" } }[];
  photos: { id: string }[];
  createdBy: { name: string };
  closedBy: { name: string } | null;
}
