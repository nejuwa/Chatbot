import type { NextConfig } from "next";

const backendOrigin =
  process.env.BACKEND_ORIGIN ??
  (process.env.NODE_ENV === "development" ? "http://localhost:4000" : "");

if (!backendOrigin) {
  throw new Error("BACKEND_ORIGIN must be set to the deployed API origin.");
}

const normalizedBackendOrigin = backendOrigin.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${normalizedBackendOrigin}/api/:path*`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${normalizedBackendOrigin}/socket.io/:path*`,
      },
    ];
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
