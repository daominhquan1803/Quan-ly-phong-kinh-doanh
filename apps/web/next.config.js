const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@hoanggia/db"],
  experimental: {
    // Monorepo (npm workspaces) — chỉ định rõ root để Next.js trace đúng file cho standalone build.
    outputFileTracingRoot: path.join(__dirname, "../../"),
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // @napi-rs/canvas chứa native binary (.node) — không cho webpack bundle, chỉ require()
    // thẳng lúc chạy (giống cách Next.js đã tự xử lý sẵn cho sharp).
    serverComponentsExternalPackages: ["@napi-rs/canvas"],
    // napi-rs require() đường dẫn binary theo platform lúc runtime (không static-analyze
    // được), nên output file tracing (dùng cho Docker standalone build) bỏ sót .node file
    // trừ khi khai báo thủ công ở đây.
    outputFileTracingIncludes: {
      "/**": ["./node_modules/@napi-rs/canvas-*/*.node"],
    },
  },
};

module.exports = nextConfig;
