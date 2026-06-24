import type { NextConfig } from 'next'
import path from 'path'

const monorepoRoot = path.join(__dirname, '..', '..')

const nextConfig: NextConfig = {
  transpilePackages: ['@central/core-ai', '@central/core-email', '@central/core-telegram', '@central/core-identity', '@central/module-concursos', '@central/module-contabilidad'],
  serverExternalPackages: ['pdf-parse'],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
