// apps/housesevillana/app/parking/route.ts — versión española de /parking.
import { NextResponse } from 'next/server'
import { CABECERAS } from '../i18n/motor'
import { HTML } from './contenido'

export const runtime = 'edge'

export function GET() {
  return new NextResponse(HTML, { headers: { ...CABECERAS } })
}
