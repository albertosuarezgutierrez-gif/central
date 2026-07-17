import { NextRequest, NextResponse } from 'next/server'
import { accesoEmpresas } from '@/lib/empresas-acceso'
import { analizarSectorWeb } from '@/lib/empresas-websearch'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

// Análisis web (gratis) de la tendencia de un sector, para el radar.
export async function POST(req: NextRequest) {
  if (!(await accesoEmpresas())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { sector?: unknown }
  const sector = typeof body.sector === 'string' ? body.sector.slice(0, 120) : ''
  if (!sector.trim()) return NextResponse.json({ error: 'sector requerido' }, { status: 400 })
  try {
    const r = await analizarSectorWeb(sector)
    return NextResponse.json(r)
  } catch (e) {
    console.error('[empresas sector-web]', e)
    return NextResponse.json({ ok: false, text: '', error: 'La búsqueda no está disponible ahora mismo.' })
  }
}
