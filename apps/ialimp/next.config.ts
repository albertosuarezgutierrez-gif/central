import type { NextConfig } from "next"
import path from "path"

// Casa de marcas: ialimp (apps/ialimp) consume @central/core-ai y @central/module-contabilidad desde ../../packages.
// Declaramos la raíz del monorepo para que el tracing incluya packages/ fuera del app root.
const monorepoRoot = path.join(__dirname, "..", "..")

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-ical", "pdf-parse", "@napi-rs/canvas", "pdfjs-dist"],
  transpilePackages: ["@central/core-ai", "@central/core-fiscal", "@central/core-identity", "@central/core-push", "@central/core-storage", "@central/core-email", "@central/module-contabilidad", "@central/module-concursos", "@central/module-crm", "@central/module-materiales", "@central/module-proveedores"],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }
}
export default nextConfig
