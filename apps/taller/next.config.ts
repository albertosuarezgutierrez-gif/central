import path from 'node:path'
import type { NextConfig } from 'next'

const monorepoRoot = path.join(__dirname, '..', '..')

const nextConfig: NextConfig = {
  transpilePackages: ['@central/brand', '@central/core-identity', '@central/module-taller'],
  outputFileTracingRoot: monorepoRoot,
  // Fotos de la recepción (comprimidas en el navegador, ~0,3 MB cada una) + firma viajan en la acción del servidor.
  experimental: { serverActions: { bodySizeLimit: '12mb' } },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
