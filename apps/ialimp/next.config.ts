import type { NextConfig } from "next"
import path from "path"

// Casa de marcas: ialimp (apps/ialimp) consume @central/core-ai y @central/module-contabilidad desde ../../packages.
// Declaramos la raíz del monorepo para que el tracing incluya packages/ fuera del app root.
const monorepoRoot = path.join(__dirname, "..", "..")

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-ical", "pdf-parse", "@napi-rs/canvas", "pdfjs-dist"],
  transpilePackages: ["@central/core-ai", "@central/core-fiscal", "@central/core-identity", "@central/core-payments", "@central/core-push", "@central/core-storage", "@central/core-email", "@central/core-firma", "@central/module-contabilidad", "@central/module-crm", "@central/module-materiales", "@central/module-proveedores", "@central/module-documental", "@central/module-rrhh"],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  // Deliberado (deuda de tipos heredada): el build de Vercel no bloquea por tipos.
  // El gate REAL de tipos es el job `typecheck` de .github/workflows/tests.yml (tsc --noEmit).
  typescript: { ignoreBuildErrors: true }
}
export default nextConfig
