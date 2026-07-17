import type { NextConfig } from 'next'
import path from 'path'

const monorepoRoot = path.join(__dirname, '..', '..')

const nextConfig: NextConfig = {
  transpilePackages: ['@central/core-ai', '@central/core-email', '@central/core-telegram', '@central/core-identity', '@central/module-concursos', '@central/module-contabilidad', '@central/module-intercompany', '@central/module-pagos', '@central/module-trading'],
  serverExternalPackages: ['pdf-parse'],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  // Deliberado (deuda de tipos heredada): el build de Vercel no bloquea por tipos.
  // El gate REAL de tipos es el job `typecheck` de .github/workflows/tests.yml (tsc --noEmit).
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
