import type { NextConfig } from "next";

// Static export so the app can be hosted on Firebase Hosting (or any static host).
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
