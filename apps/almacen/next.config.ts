import path from 'node:path'
import type { NextConfig } from 'next'

const monorepoRoot = path.join(__dirname, '..', '..')

const nextConfig: NextConfig = {
  transpilePackages: ['@central/brand', '@central/core-identity', '@central/module-materiales'],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
