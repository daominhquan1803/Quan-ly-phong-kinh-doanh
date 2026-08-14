import { FieldDef } from "./column-mapper";

export type SalesPlanFieldKey =
  | "employeeName"
  | "productCode"
  | "productName"
  | "productGroup"
  | "targetRevenue"
  | "targetQuantity";

export const SALES_PLAN_FIELDS: FieldDef<SalesPlanFieldKey>[] = [
  {
    key: "employeeName",
    label: "Nhân viên kinh doanh",
    required: true,
    synonyms: ["nhân viên kinh doanh", "nhân viên", "nhan vien kinh doanh", "sales", "nvkd"],
  },
  {
    key: "productCode",
    label: "Mã sản phẩm",
    required: false,
    synonyms: ["mã sản phẩm", "mã hàng", "ma san pham", "product code"],
  },
  {
    key: "productName",
    label: "Tên sản phẩm",
    required: false,
    // "sản phẩm" trần (không có tiền tố "mã"/"tên") được ưu tiên hiểu là tên/nhóm sản phẩm
    // chứ không phải mã hàng — khớp đúng với file kế hoạch thật (cột "Sản phẩm" chứa tên
    // danh mục như "Túi PE", "Băng dính", không phải mã hàng AMIS).
    synonyms: ["tên sản phẩm", "tên hàng", "ten san pham", "sản phẩm"],
  },
  {
    key: "productGroup",
    label: "Nhóm hàng",
    required: false,
    synonyms: ["nhóm hàng", "nhóm sản phẩm", "danh mục", "nhom hang", "product group"],
  },
  {
    key: "targetRevenue",
    label: "Doanh số mục tiêu",
    required: true,
    synonyms: ["doanh số mục tiêu", "doanh số kế hoạch", "chỉ tiêu doanh số", "kế hoạch doanh số", "target revenue"],
  },
  {
    key: "targetQuantity",
    label: "Số lượng mục tiêu",
    required: false,
    synonyms: ["số lượng mục tiêu", "sl kế hoạch", "số lượng kế hoạch", "target quantity"],
  },
];
