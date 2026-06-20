import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@livekit/rtc-node", "ws"],
  // Allow the Cloudflare quick-tunnel host to reach the dev server.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
