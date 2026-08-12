// apps/housesevillana/app/en/route.ts
//
// Versión en inglés, derivada del MISMO HTML que sirve `app/route.ts`.
// Motivo (GA4, 12 meses a 11/08/2026): el 72% de los visitantes navega en inglés.

import { NextResponse } from 'next/server'
import { HTML } from '../route'
import { CABECERAS, localizar } from '../i18n/motor'
import { TRADUCCIONES } from './traducciones'

export const runtime = 'edge'

export function GET() {
  return new NextResponse(
    localizar(HTML, { codigo: 'en', ogLocale: 'en_GB', diccionario: TRADUCCIONES }),
    { headers: { ...CABECERAS } },
  )
}
