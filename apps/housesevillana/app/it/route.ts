// apps/housesevillana/app/it/route.ts
//
// Versión en italiano, derivada del MISMO HTML que sirve `app/route.ts`.
// Motivo (GA4, 12 meses a 11/08/2026): el italiano es el tercer idioma de los
// visitantes (11%) e Italia el 10% de los usuarios, por detrás de EE.UU. y España.

import { NextResponse } from 'next/server'
import { HTML } from '../route'
import { CABECERAS, localizar } from '../i18n/motor'
import { TRADUCCIONES } from './traducciones'

export const runtime = 'edge'

export function GET() {
  return new NextResponse(
    localizar(HTML, { codigo: 'it', ogLocale: 'it_IT', diccionario: TRADUCCIONES }),
    { headers: { ...CABECERAS } },
  )
}
