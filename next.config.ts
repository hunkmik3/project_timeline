import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF route reads its font from public/ at runtime. On a serverless
  // deploy public/ goes to the CDN, not into the function's filesystem, so the
  // files have to be traced in explicitly — otherwise the export works locally
  // and fails in production.
  outputFileTracingIncludes: {
    "/api/export-pdf": ["./public/fonts/**"],
  },
};

export default nextConfig;
