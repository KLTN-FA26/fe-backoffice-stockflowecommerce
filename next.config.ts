import type { NextConfig } from "next";

// Authenticated traffic goes through Route Handlers; no direct backend rewrite.
const nextConfig: NextConfig = { devIndicators: false };
export default nextConfig;
