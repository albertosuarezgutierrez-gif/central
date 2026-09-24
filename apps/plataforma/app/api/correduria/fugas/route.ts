import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { fugasPendientes, revisarFuga } from '@/lib/fugas-cartera'
import { MOTIVOS_PERDIDA_VENTA } from '@central/module-seguros'

export const dynamic = 'force-dynamic'

/** GET — pérdidas de cartera por revisar (puerto de asegura). `sin_datos` ≠ «no hay». */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await fugasPendientes()
  if (r.estado === 'sin_datos') return NextResponse.json({ estado: 'sin_datos', causa: r.causa })
  return NextResponse.json({ estado: 'ok', fugas: r.dato, motivos: MOTIVOS_PERDIDA_VENTA })
}

/** PATCH { id, resolucion: 'perdida' | 'no_es_perdida', motivo? } — el actor sale de la SESIÓN. */
export async function PATCH(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof b?.id === 'string' ? b.id : ''
  const resolucion = b?.resolucion === 'perdida' || b?.resolucion === 'no_es_perdida' ? b.resolucion : null
  const motivo = typeof b?.motivo === 'string' ? b.motivo : null
  if (!id || !resolucion) return NextResponse.json({ ok: false, motivo: 'falta id o resolución' }, { status: 422 })
  const r = await revisarFuga(id, resolucion, resolucion === 'perdida' ? motivo : null, guarda.session.email)
  return NextResponse.json(r, { status: r.ok ? 200 : 422 })
}
