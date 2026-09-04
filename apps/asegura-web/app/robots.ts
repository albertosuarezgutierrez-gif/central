import type { MetadataRoute } from 'next'
import { url } from '@/lib/sitio'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // `/api/` fuera: no es contenido, y el endpoint de leads solo acepta
        // POST. Rastrearlo solo produce errores en el informe de cobertura.
        disallow: ['/api/'],
      },
    ],
    sitemap: url('/sitemap.xml'),
    host: url('/'),
  }
}
