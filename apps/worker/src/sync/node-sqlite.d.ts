// Khai báo tối thiểu cho module "node:sqlite" của Node 22 (@types/node 20 chưa có) — chỉ phần baoGiaApp.ts dùng.
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    prepare(sql: string): { all(...params: unknown[]): Record<string, unknown>[] };
    close(): void;
  }
}
