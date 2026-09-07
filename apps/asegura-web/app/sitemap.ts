import type { MetadataRoute } from 'next'
import { FECHA_TEXTOS_WEB } from '@central/module-seguros'
import { RAMOS } from '@/lib/ramos'
import { url } from '@/lib/sitio'

// Sitemap generado desde las mismas fuentes que las páginas. Escribirlo a mano
// garantiza que un día liste una URL que ya no existe (404 servido a Google) o
// que se olvide una nueva (una página que nadie encuentra). Aquí, añadir un
// ramo a `RAMOS` lo mete solo.
//
// 🚨 `lastModified` — por qué la mayoría de las URL NO lo llevan.
//
// Hasta el 07/09/2026 todas declaraban `new Date()`, o sea la hora de la
// petición: cada vez que Google pedía el sitemap, las once URL le decían «he
// cambiado hoy». Eso no es un dato, es el `NULL` colapsado a un valor que
// prohíbe `CLAUDE.md`, y encima se paga: un lastmod que siempre miente enseña
// al buscador a ignorar el campo en TODO el sitio, incluidas las páginas donde
// sí sabemos la fecha.
//
// Las legales SÍ la saben: cambian cuando cambia `FECHA_TEXTOS_WEB` (la versión
// de los textos públicos, en `@central/module-seguros`), que es exactamente el
// día en que se tocaron. Para la portada y los ramos no hay fuente de esa fecha
// —el copy vive en `lib/ramos.ts` y nadie anota cuándo se editó—, así que el
// campo se **omite**: ausente es la verdad, y Google trata la ausencia como
// «no informado», no como «no ha cambiado».
const LEGALES = new Date(FECHA_TEXTOS_WEB)

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: url('/'), changeFrequency: 'monthly', priority: 1 },
    { url: url('/cambiar-de-correduria'), changeFrequency: 'yearly', priority: 0.9 },
    ...RAMOS.map((r) => ({
      url: url(`/seguros/${r.slug}`),
      changeFrequency: 'monthly' as const,
      // Todos los ramos valen lo mismo para Google; la prioridad comercial se
      // trabaja con contenido y enlaces internos, no con este número (que los
      // buscadores prácticamente ignoran).
      priority: 0.8,
    })),
    // Prioridad alta a propósito: es la página con la mejor posición medida de
    // todo el dominio (7,7), y la que Google ya conocía del sitio anterior.
    { url: url('/siniestro'), changeFrequency: 'monthly', priority: 0.9 },
    { url: url('/quienes-somos'), changeFrequency: 'yearly', priority: 0.5 },
    { url: url('/legal/informacion-mediador'), lastModified: LEGALES, changeFrequency: 'yearly', priority: 0.3 },
    { url: url('/legal/privacidad'), lastModified: LEGALES, changeFrequency: 'yearly', priority: 0.3 },
    { url: url('/legal/aviso-legal'), lastModified: LEGALES, changeFrequency: 'yearly', priority: 0.3 },
    { url: url('/legal/cookies'), lastModified: LEGALES, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
