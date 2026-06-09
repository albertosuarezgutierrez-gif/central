import type { NextConfig } from 'next'
import path from 'path'

const monorepoRoot = path.join(__dirname, '..', '..')

const nextConfig: NextConfig = {
  transpilePackages: ['@iarest/core-identity', '@iarest/module-contabilidad'],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
