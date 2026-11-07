import path from 'node:path'
import type { NextConfig } from 'next'

const monorepoRoot = path.join(__dirname, '..', '..')

const nextConfig: NextConfig = {
  transpilePackages: ['@central/brand', '@central/core-email', '@central/core-firma', '@central/core-herramientas', '@central/core-identity', '@central/core-telegram', '@central/legal-templates'],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }, { key: 'Referrer-Policy', value: 'same-origin' }, { key: 'X-Content-Type-Options', value: 'nosniff' }] }]
  },
}

export default nextConfig
