// apps/housesevillana/app/en/route.ts
//
// Versión en inglés, derivada del MISMO HTML que sirve `app/route.ts`.
// Motivo (GA4, 12 meses a 11/08/2026): el 72% de los visitantes navega en inglés.

import { NextResponse } from 'next/server'
import { HTML } from '../route'
import { CABECERAS, localizar } from '../i18n/motor'
import { TRADUCCIONES } from './traducciones'

export const runtime = 'edge'

// Fuera del diccionario a propósito: son las etiquetas que el agente SEO reescribe cada
// lunes en el HTML español. Ver el campo `meta` de `Variante` en `../i18n/motor`.
const META = {
  title: 'Holiday home in central Seville with parking | House Sevillana',
  description:
    'Rent this 290 m² house in central Seville: 6 bedrooms, 4 bathrooms, private parking and an Andalusian courtyard. Ideal for groups of up to 12. Book direct with no fees.',
  ogDescription:
    'Holiday home in central Seville with private parking and an Andalusian courtyard, sleeping 12. Book direct with no fees.',
}

export function GET() {
  return new NextResponse(
    localizar(HTML, { codigo: 'en', ogLocale: 'en_GB', diccionario: TRADUCCIONES, meta: META }),
    { headers: { ...CABECERAS } },
  )
}
