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
  transpilePackages: ['@central/core-ai', '@central/core-fiscal', '@central/core-push'],
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
}
module.exports = nextConfig
