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
  resolution: string | null;
  invoiceAdjusted: boolean | null;
  adjustedInvoiceNumbers: string | null;
  invoiceAdjustNote: string | null;
  shipmentSlip: { id: string; slipNumber: string; slipDate: string | null } | null;
  items: { id: string; slipItemId: string | null; itemCode: string | null; itemName: string; unit: string | null; deliveredQty: string | null; defectQty: string }[];
  responsibles: { user: { id: string; name: string; role: "ADMIN" | "SALES"; accessLevel: "FULL" | "OPERATOR" | "VIEWER" } }[];
  photos: { id: string }[];
  createdBy: { name: string };
  closedBy: { name: string } | null;
}
