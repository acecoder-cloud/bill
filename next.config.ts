import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bill photos go to Supabase Storage directly from the browser; only small JSON hits our API.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
