import { NextResponse } from 'next/server'
import { esTipoImportacion, plantillaCsv } from '@central/module-patrimonio'

import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/patrimonio/importaciones/plantilla?tipo=inmueble|contrato|gasto` — CSV con solo las cabeceras (`;` y BOM: se abre
 * bien en Excel en español). Sin datos de nadie: no consulta la BD.
 */
export async function GET(req: Request) {
  try {
    await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tipo = new URL(req.url).searchParams.get('tipo')
  if (!esTipoImportacion(tipo)) return NextResponse.json({ error: 'datos_invalidos', campo: 'tipo' }, { status: 400 })
  return new Response(plantillaCsv(tipo), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="plantilla-${tipo}.csv"`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    },
  })
}
