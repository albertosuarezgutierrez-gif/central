const path = require('path')

// Casa de marcas: ia-rest vive en apps/ia-rest; los packages compartidos están en
// ../../packages. Declaramos la raíz del monorepo para que Turbopack/tracing resuelvan
// los @central/* (consumidos vía `file:` deps → node_modules/@central/*) fuera de apps/ia-rest.
const monorepoRoot = path.join(__dirname, '..', '..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Las variables de entorno se gestionan en Vercel → Settings → Environment Variables
  // NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY: configuradas en Vercel
  // SUPABASE_SERVICE_ROLE_KEY: solo server-side, configurada en Vercel (nunca hardcodear aquí)

  // Monorepo casa de marcas: compila los paquetes workspace (fuente TS) en el build.
  // NOTA: residuo de antes de la migración a next.config.ts (Next usa el .ts). Se mantiene
  // sincronizado como red de seguridad; la fuente canónica de transpilePackages es next.config.ts.
  transpilePackages: ['@central/core-ai', '@central/core-fiscal', '@central/core-payments', '@central/core-push', '@central/module-contabilidad', '@central/module-crm', '@central/module-flota', '@central/module-materiales', '@central/module-horario', '@central/module-asn', '@central/module-presupuestos', '@central/module-proveedores', '@central/module-feedback', '@central/module-organizador-trabajo', '@central/module-trazabilidad'],
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
}
module.exports = nextConfig
