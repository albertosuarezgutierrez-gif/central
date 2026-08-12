// apps/housesevillana/app/en/route.ts
//
// Versión en inglés de la landing, derivada del MISMO HTML que sirve `app/route.ts`.
// No es una copia: se traduce en tiempo de petición con el diccionario de
// `traducciones.ts`, así el agente SEO puede seguir reescribiendo un único fichero.
//
// Motivo (GA4, 12 meses a 11/08/2026): el 72% de los visitantes navega en inglés y la
// página solo existía en español.

import { NextResponse } from 'next/server'
import { HTML } from '../route'
import { traducir } from './traducciones'

export const runtime = 'edge'

/** Ajustes que no son texto traducible sino metadatos de la variante de idioma. */
function localizar(html: string): string {
  return traducir(html)
    .replace('<html lang="es">', '<html lang="en">')
    // El canonical de esta variante es /en; los hreflang ya vienen del HTML original y
    // son correctos para ambas (apuntan a las dos versiones más el x-default).
    .replace(
      '<link rel="canonical" href="https://www.housesevillana.es/"/>',
      '<link rel="canonical" href="https://www.housesevillana.es/en"/>',
    )
    // og:locale, para que al compartir en redes se muestre la ficha correcta.
    .replace('content="es_ES"', 'content="en_GB"')
}

export function GET() {
  return new NextResponse(localizar(HTML), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
