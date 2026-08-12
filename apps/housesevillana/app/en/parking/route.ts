// apps/housesevillana/app/en/parking/route.ts — /parking en inglés (72% del tráfico real).
import { NextResponse } from 'next/server'
import { CABECERAS, localizar } from '../../i18n/motor'
import { HTML } from '../../parking/contenido'
import { EN } from '../../parking/traducciones'

export const runtime = 'edge'

export function GET() {
  return new NextResponse(
    localizar(HTML, { codigo: 'en', ogLocale: 'en_GB', diccionario: EN, ruta: '/parking' }),
    { headers: { ...CABECERAS } },
  )
}
