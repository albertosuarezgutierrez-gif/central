// apps/housesevillana/app/it/parking/route.ts — /parking en italiano (11% del tráfico real).
import { NextResponse } from 'next/server'
import { CABECERAS, localizar } from '../../i18n/motor'
import { HTML } from '../../parking/contenido'
import { IT } from '../../parking/traducciones'

export const runtime = 'edge'

export function GET() {
  return new NextResponse(
    localizar(HTML, { codigo: 'it', ogLocale: 'it_IT', diccionario: IT, ruta: '/parking' }),
    { headers: { ...CABECERAS } },
  )
}
