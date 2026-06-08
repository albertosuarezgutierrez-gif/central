import type { NextConfig } from "next"
import path from "path"

// Casa de marcas: ialimp (apps/ialimp) consume @iarest/core-ai desde ../../packages.
// Declaramos la raíz del monorepo para que el tracing incluya packages/ fuera del app root.
const monorepoRoot = path.join(__dirname, "..", "..")

const nextConfig: NextConfig = {
  // web-push lo importa @iarest/core-push (fuera del app root); como `serverExternalPackage`
  // Next no intenta bundlearlo y lo require() en runtime desde node_modules.
  serverExternalPackages: ["node-ical", "web-push"],
  transpilePackages: ["@iarest/core-ai", "@iarest/core-push"],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }
}
export default nextConfig
