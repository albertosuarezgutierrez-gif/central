import type { NextConfig } from "next"
import path from "path"

// Casa de marcas: ialimp (apps/ialimp) consume @iarest/core-ai desde ../../packages.
// Declaramos la raíz del monorepo para que el tracing incluya packages/ fuera del app root.
const monorepoRoot = path.join(__dirname, "..", "..")

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-ical"],
  transpilePackages: ["@iarest/core-ai"],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }
}
export default nextConfig
