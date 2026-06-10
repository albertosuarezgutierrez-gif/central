import type { NextConfig } from "next"
import path from "path"

// Casa de marcas: ialimp (apps/ialimp) consume @iarest/core-ai y @iarest/module-contabilidad desde ../../packages.
// Declaramos la raíz del monorepo para que el tracing incluya packages/ fuera del app root.
const monorepoRoot = path.join(__dirname, "..", "..")

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-ical", "pdf-parse"],
  transpilePackages: ["@iarest/core-ai", "@iarest/core-push", "@iarest/core-storage", "@iarest/core-email", "@iarest/module-contabilidad", "@iarest/module-concursos"],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }
}
export default nextConfig
