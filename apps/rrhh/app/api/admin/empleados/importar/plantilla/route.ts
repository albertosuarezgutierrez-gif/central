// Plantilla de importación de empleados, en CSV (se abre con Excel). Sin datos de nadie: solo cabeceras.
// No se genera .xlsx: `xlsx@0.18.5` tiene una CVE abierta y la app solo la usa para LEER (lib/importar-empleados-xlsx.ts).
import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { plantillaCsv } from '@/lib/importar-empleados'

export const runtime = 'nodejs'

export async function GET() {
  try { await getSesion() } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
  return new NextResponse(plantillaCsv(), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="plantilla-empleados.csv"',
      'cache-control': 'no-store',
    },
  })
}
