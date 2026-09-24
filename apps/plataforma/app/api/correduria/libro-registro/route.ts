import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { csvLibro, interpretarLibro, libroRegistroAsegura } from '@/lib/libro-registro-asegura'

export const dynamic = 'force-dynamic'

/** GET ?año=YYYY → CSV del libro registro de pólizas intermediadas; si no se puede leer, 502 con el motivo. */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const año = Number(new URL(req.url).searchParams.get('año'))
  if (!Number.isInteger(año) || año < 2000 || año > Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).slice(0, 4))) {
    return NextResponse.json({ error: 'Año no válido.' }, { status: 422 })
  }
  const r = await libroRegistroAsegura(año)
  const l = interpretarLibro(r.status, r.json)
  if (l.estado !== 'ok') return NextResponse.json({ error: l.motivo }, { status: 502 })
  return new NextResponse('﻿' + csvLibro(l), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="libro-registro-${año}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
