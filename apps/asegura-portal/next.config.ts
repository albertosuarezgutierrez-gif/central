import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // `@central/brand` es fuente TS pura (sin build): Next tiene que compilarla.
  transpilePackages: ['@central/brand', '@central/core-ai', '@central/core-catastro', '@central/core-direccion', '@central/core-email', '@central/core-identity', '@central/core-push', '@central/core-telegram', '@central/module-documental', '@central/module-patrimonio', '@central/module-seguros', '@central/module-seguros-pii', '@central/module-seguros-portal', '@central/module-tarificacion'],
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  // Ninguna URL del portal (enlaces con correo o llaves) sale en el Referer hacia otro sitio.
  async headers() {
    return [
      { source: '/:path*', headers: [{ key: 'Referrer-Policy', value: 'same-origin' }] },
      // El QR del vehículo (27/10/2026): la URL lleva el token y solo debe viajar en la pegatina. Va DESPUÉS del
      // general a propósito: con la misma clave, gana la última regla que casa.
      {
        source: '/v/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}

export default nextConfig
