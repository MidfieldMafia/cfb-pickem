import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Feedback's screenshot (#237) may be up to 1 MB, and the 1 MB default
      // counts the whole multipart body, the text and boundaries included.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
