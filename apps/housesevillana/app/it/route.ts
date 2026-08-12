// apps/housesevillana/app/it/route.ts
//
// Versión en italiano, derivada del MISMO HTML que sirve `app/route.ts`.
// Motivo (GA4, 12 meses a 11/08/2026): el 11% de los visitantes navega en italiano.

import { NextResponse } from 'next/server'
import { HTML } from '../route'
import { CABECERAS, localizar } from '../i18n/motor'
import { TRADUCCIONES } from './traducciones'

export const runtime = 'edge'

// Fuera del diccionario a propósito: son las etiquetas que el agente SEO reescribe cada
// lunes en el HTML español. Ver el campo `meta` de `Variante` en `../i18n/motor`.
const META = {
  title: 'Casa vacanze nel centro di Siviglia con parcheggio | House Sevillana',
  description:
    'Affitta questa casa di 290 m² nel centro di Siviglia: 6 camere, 4 bagni, parcheggio privato e patio andaluso. Ideale per gruppi fino a 12 persone. Prenotazione diretta senza commissioni.',
  ogDescription:
    'Casa vacanze nel centro di Siviglia con parcheggio privato e patio andaluso per 12 persone. Prenotazione diretta senza commissioni.',
}

export function GET() {
  return new NextResponse(
    localizar(HTML, { codigo: 'it', ogLocale: 'it_IT', diccionario: TRADUCCIONES, meta: META }),
    { headers: { ...CABECERAS } },
  )
}
