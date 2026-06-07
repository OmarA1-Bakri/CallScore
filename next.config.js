// @ts-nocheck
/* eslint-env node */

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "yt3.ggpht.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.call-score.com" }],
        destination: "https://call-score.com/:path*",
        permanent: true,
      },
      {
        source: "/discover",
        destination: "/",
        permanent: true,
      },
      {
        source: "/experiences/:experienceId",
        destination: "/",
        permanent: true,
      },
    ];
  },
  experimental: {},
};

module.exports = nextConfig;
