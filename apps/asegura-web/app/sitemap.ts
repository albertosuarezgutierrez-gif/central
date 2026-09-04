import type { MetadataRoute } from 'next'
import { RAMOS } from '@/lib/ramos'
import { url } from '@/lib/sitio'

// Sitemap generado desde las mismas fuentes que las páginas. Escribirlo a mano
// garantiza que un día liste una URL que ya no existe (404 servido a Google) o
// que se olvide una nueva (una página que nadie encuentra). Aquí, añadir un
// ramo a `RAMOS` lo mete solo.
export default function sitemap(): MetadataRoute.Sitemap {
  const ahora = new Date()
  return [
    { url: url('/'), lastModified: ahora, changeFrequency: 'monthly', priority: 1 },
    { url: url('/cambiar-de-correduria'), lastModified: ahora, changeFrequency: 'yearly', priority: 0.9 },
    ...RAMOS.map((r) => ({
      url: url(`/seguros/${r.slug}`),
      lastModified: ahora,
      changeFrequency: 'monthly' as const,
      // Todos los ramos valen lo mismo para Google; la prioridad comercial se
      // trabaja con contenido y enlaces internos, no con este número (que los
      // buscadores prácticamente ignoran).
      priority: 0.8,
    })),
    { url: url('/quienes-somos'), lastModified: ahora, changeFrequency: 'yearly', priority: 0.5 },
    { url: url('/legal/informacion-mediador'), lastModified: ahora, changeFrequency: 'yearly', priority: 0.3 },
    { url: url('/legal/privacidad'), lastModified: ahora, changeFrequency: 'yearly', priority: 0.3 },
    { url: url('/legal/aviso-legal'), lastModified: ahora, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
