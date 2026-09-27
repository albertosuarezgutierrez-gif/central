import type { NextConfig } from 'next'
import path from 'path'

const monorepoRoot = path.join(__dirname, '..', '..')

const nextConfig: NextConfig = {
  transpilePackages: ['@central/core-ai', '@central/core-catastro', '@central/core-email', '@central/core-telegram', '@central/core-identity', '@central/core-payments', '@central/module-concursos', '@central/module-contabilidad', '@central/module-intercompany', '@central/module-pagos', '@central/module-ses', '@central/module-seguros', '@central/module-subastas', '@central/module-trading'],
  // @hyzyla/pdfium: WASM del rasterizador de PDF (lib/subastas/rasterizar-pdf.ts) —
  // externo para que webpack no intente empaquetar el .wasm.
  serverExternalPackages: ['pdf-parse', '@hyzyla/pdfium'],
  outputFileTracingRoot: monorepoRoot,
  eslint: { ignoreDuringBuilds: true },
  // Deliberado (deuda de tipos heredada): el build de Vercel no bloquea por tipos.
  // El gate REAL de tipos es el job `typecheck` de .github/workflows/tests.yml (tsc --noEmit).
  typescript: { ignoreBuildErrors: true },
  // `/seguros` era la landing pública de la correduría ANTES de que existiera
  // `apps/asegura-web` (grupoasegura.es). Desde el 05/09/2026 las dos compiten
  // por la misma consulta desde dos dominios distintos del mismo negocio —
  // decisión de Alberto (14/09/2026): 301 hacia la web de marca, no dejarla
  // noindex y viva. `permanent: true` = 308 (equivalente a 301 para SEO; Next
  // ya no emite 301 puro desde el App Router). La página y su formulario se
  // BORRARON (`git log` conserva el código si hiciera falta consultarlo): un
  // redirect los deja inalcanzables, así que mantenerlos habría sido código
  // muerto que nadie iba a volver a ejecutar.
  async redirects() {
    return [{ source: '/seguros', destination: 'https://grupoasegura.es', permanent: true }]
  },
  // La Product Form Library de Codeoscopic (widget de la correduría para
  // pintar el formulario REAL de consentimiento de cada compañía, en vez de
  // un catálogo estático adivinado — ver `apps/asegura/lib/codeoscopic/
  // product-form.ts`) pinta un `<iframe>` propio. Requisito documentado por
  // el propio fabricante (`overview.md` del portal, capturado 17/09/2026):
  // `frame-src 'self' *.codeoscopic.io;`. No se toca ninguna otra directiva:
  // hoy no hay CSP en esta app, así que esta es la única restricción nueva.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [{ key: 'Content-Security-Policy', value: "frame-src 'self' *.codeoscopic.io;" }],
      },
    ]
  },
}

export default nextConfig
