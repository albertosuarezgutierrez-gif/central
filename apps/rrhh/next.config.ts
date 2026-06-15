import type { NextConfig } from "next"
import path from "path"

// Casa de marcas: rrhh (apps/rrhh) es una vertical autónoma. Declaramos la raíz del
// monorepo para que el tracing resuelva packages/ fuera del app root (cuando se añadan).
const monorepoRoot = path.join(__dirname, "..", "..")

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  // Núcleos compartidos (TS puro) que rrhh compila en su build.
  transpilePackages: ['@central/core-storage', '@central/module-documental', '@central/module-chat'],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }
}
export default nextConfig
