import type { NextConfig } from "next";

const backendPort = process.env.BACKEND_PORT ?? "3100";
const backendUrl = `http://localhost:${backendPort}`;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api",
        destination: backendUrl
      },
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`
      }
    ];
  }
};

export default nextConfig;
