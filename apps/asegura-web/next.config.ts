import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // `@central/brand` y `@central/module-seguros` son fuente TS pura (sin build):
  // Next tiene que compilarlas.
  transpilePackages: ['@central/brand', '@central/module-seguros'],
}

export default nextConfig
