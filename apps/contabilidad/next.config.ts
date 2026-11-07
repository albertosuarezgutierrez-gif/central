import path from 'node:path'
import type { NextConfig } from 'next'

const monorepoRoot = path.join(__dirname, '..', '..')

const nextConfig: NextConfig = {
  transpilePackages: ['@central/brand', '@central/core-banca', '@central/core-email', '@central/core-fiscal', '@central/core-identity', '@central/module-contabilidad', '@central/module-seguros'],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
