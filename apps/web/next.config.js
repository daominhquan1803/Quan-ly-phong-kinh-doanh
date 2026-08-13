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
  },
};

module.exports = nextConfig;
