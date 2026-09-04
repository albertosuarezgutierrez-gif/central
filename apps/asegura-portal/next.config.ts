import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // `@central/brand` es fuente TS pura (sin build): Next tiene que compilarla.
  transpilePackages: ['@central/brand'],
  serverExternalPackages: ['pdf-parse'],
}

export default nextConfig
