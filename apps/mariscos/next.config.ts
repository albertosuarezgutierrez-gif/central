import type { NextConfig } from 'next'
import path from 'path'

const monorepoRoot = path.join(__dirname, '..', '..')

const nextConfig: NextConfig = {
  transpilePackages: ['@central/core-identity', '@central/module-pesca'],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  // Deliberado (igual que el resto de verticales): el build de Vercel no bloquea por tipos.
  // El gate REAL de tipos es el job `typecheck` de CI (tsc --noEmit).
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
