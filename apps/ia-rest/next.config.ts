import type { NextConfig } from "next"
import path from "path"

// Casa de marcas: ia-rest vive en apps/ia-rest; los packages compartidos están en
// ../../packages. Declaramos la raíz del monorepo para que Turbopack/tracing resuelvan
// los @central/* (consumidos vía `file:` deps → node_modules/@central/*) fuera de apps/ia-rest.
const monorepoRoot = path.join(__dirname, "..", "..")

// cache-bust: 2026-05-26
const nextConfig: NextConfig = {
  // Forzar renderizado dinámico en todos los API routes
  // Evita "supabaseUrl is required" durante el build estático
  // (las env vars de Supabase solo están disponibles en runtime)

  // Monorepo casa de marcas: compila los paquetes workspace (fuente TS) en el build.
  transpilePackages: ['@central/core-ai', '@central/core-fiscal', '@central/core-payments', '@central/core-push', '@central/module-contabilidad', '@central/module-crm', '@central/module-materiales', '@central/module-horario', '@central/module-asn', '@central/module-presupuestos', '@central/module-proveedores', '@central/module-feedback', '@central/module-organizador-trabajo', '@central/module-trazabilidad'],
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },

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
