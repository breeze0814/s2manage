/** @type {import('next').NextConfig} */
const development = process.env.NODE_ENV === "development";

const nextConfig = {
  reactStrictMode: true,
  distDir: development ? ".next-dev" : ".next",
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: embedHeaders(),
      },
      {
        source: "/api/embed/:path*",
        headers: embedHeaders(),
      },
    ];
  },
};

function embedHeaders() {
  return [
    { key: "Cache-Control", value: "no-store" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'self' http: https:" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}

export default nextConfig;
