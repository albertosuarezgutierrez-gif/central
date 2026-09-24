import type { MetadataRoute } from 'next'

/**
 * Manifiesto que hace INSTALABLE la intranet (24/09/2026, «quiero una app como la de los clientes»).
 * Sustituye al `public/manifest.json` de 2026-06, que nunca llegó a instalar: sin service worker
 * Chrome no ofrece el botón, su único icono era SVG y su `start_url` (`/dashboard`) daba dos saltos.
 *
 * 🚨 Solo no basta: Chrome exige además un SW con manejador de `fetch` (`public/sw.js`, lo registra
 * `app/RegistrarSW.tsx`). En iOS no hay oferta: se explica en el Inicio (`AvisoInstalar`).
 * Colores en HEX: los lanzadores de Android no entienden `var()` ni `oklch()`, y un color ilegible
 * aquí no falla, se ignora. Lo vigila `lib/pwa.test.ts`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mi grupo',
    short_name: 'Mi grupo',
    description: 'Correduría, pisos, bolsa y banco en una sola pantalla.',
    lang: 'es',
    // La sesión dura 30 días: abrir la app instalada entra directo al Inicio.
    start_url: '/inicio',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f7f9',
    theme_color: '#3364ee',
    icons: [
      { src: '/icono-app', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icono-app', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
