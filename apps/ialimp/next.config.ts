import type { NextConfig } from "next"
const nextConfig: NextConfig = {
  serverExternalPackages: ["node-ical"],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }
}
export default nextConfig
