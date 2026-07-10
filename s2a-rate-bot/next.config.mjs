/** @type {import('next').NextConfig} */
const development = process.env.NODE_ENV === "development";

const nextConfig = {
  reactStrictMode: true,
  distDir: development ? ".next-dev" : ".next",
};

export default nextConfig;
