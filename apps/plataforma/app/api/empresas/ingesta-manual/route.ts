import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { ingestaDia } from '@/lib/borme-ingesta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Disparador manual desde el panel: ingiere el BORME de una fecha (por defecto hoy).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { fecha?: unknown }
  const iso =
    typeof body.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha)
      ? body.fecha
      : new Date().toISOString().slice(0, 10)
  try {
    const r = await ingestaDia(iso)
    return NextResponse.json({ ok: true, fecha: iso, ...r })
  } catch (e) {
    console.error('[borme ingesta-manual]', e)
    return NextResponse.json({ ok: false, fecha: iso, error: String(e) }, { status: 500 })
  }
}
