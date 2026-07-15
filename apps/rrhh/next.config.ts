import type { NextConfig } from "next"
import path from "path"

// Casa de marcas: rrhh (apps/rrhh) es una vertical autónoma. Declaramos la raíz del
// monorepo para que el tracing resuelva packages/ fuera del app root (cuando se añadan).
const monorepoRoot = path.join(__dirname, "..", "..")

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  // Núcleos compartidos (TS puro) que rrhh compila en su build.
  transpilePackages: ['@central/core-ai', '@central/core-email', '@central/core-firma', '@central/core-storage', '@central/core-identity', '@central/legal-templates', '@central/module-documental', '@central/module-rrhh', '@central/module-chat', '@central/module-nominas', '@central/module-geo', '@central/module-horario'],
  serverExternalPackages: ['pdfjs-dist', 'pdf-lib', '@react-pdf/renderer'],
  eslint: { ignoreDuringBuilds: true },
  // Deliberado (deuda de tipos heredada): el build de Vercel no bloquea por tipos.
  // El gate REAL de tipos es el job `typecheck` de .github/workflows/tests.yml (tsc --noEmit).
  typescript: { ignoreBuildErrors: true }
}
export default nextConfig
