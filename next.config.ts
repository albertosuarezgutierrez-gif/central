import type { NextConfig } from "next"

// cache-bust: 2026-05-26
const nextConfig: NextConfig = {
  // Forzar renderizado dinámico en todos los API routes
  // Evita "supabaseUrl is required" durante el build estático
  // (las env vars de Supabase solo están disponibles en runtime)

  // Monorepo casa de marcas: compila el paquete workspace (fuente TS) en el build.
  transpilePackages: ['@iarest/core-ai'],

  async headers() {
    return [
      {
        // Aplicar a todas las rutas
        source: '/(.*)',
        headers: [
          // Evita que la app se cargue en un <iframe> → clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Evita que el browser detecte tipos MIME incorrectos
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // No enviar Referer completo a dominios externos
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Desactivar APIs que no usa la app
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=(self)' },
          // XSS protection legacy (navegadores viejos)
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ]
  },
}

export default nextConfig
