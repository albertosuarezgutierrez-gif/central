import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // `@central/brand` es fuente TS pura (sin build): Next tiene que compilarla.
  transpilePackages: ['@central/brand', '@central/core-push'],
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  // Ninguna URL del portal (enlaces con correo o llaves) sale en el Referer hacia otro sitio.
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'Referrer-Policy', value: 'same-origin' }] }]
  },
}

export default nextConfig
