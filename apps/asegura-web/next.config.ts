import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // `@central/brand` y `@central/module-seguros` son fuente TS pura (sin build):
  // Next tiene que compilarlas.
  transpilePackages: ['@central/brand', '@central/module-seguros'],

  // 🚨 URLs del sitio ANTERIOR que Google sigue sirviendo, y que desde que este
  // proyecto tomó el apex (05/09/2026) devolvían un 404. Medido en Search
  // Console el 07/09/2026: `/mejoramos-tu-seguro/` acumulaba 51 impresiones en
  // posición 24 — o sea, tráfico real aterrizando en una página de error.
  //
  // `/siniestro` NO está aquí a propósito: esa se ha recuperado como página
  // propia (`app/siniestro/page.tsx`) porque su posición media era 7,7, la
  // mejor del dominio. Una 301 hacia una página que no responde a la intención
  // de la consulta es un soft-404 con otro nombre: se redirige lo que tiene un
  // destino equivalente, y se escribe lo que no.
  //
  // Google entra con la barra final (`/mejoramos-tu-seguro/`); Next la quita
  // con su 308 y aterriza en esta regla.
  async redirects() {
    return [
      {
        source: '/mejoramos-tu-seguro',
        // «Mejoramos tu seguro» era la promesa del sitio viejo, y lo que de
        // verdad hay detrás —traerte la póliza sin tocarla— es esta página.
        destination: '/cambiar-de-correduria',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
