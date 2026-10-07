import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { cerrarAcompanamiento, trabajoVivo } from '@/lib/tarificador-formador'
import { formadorActivo, leerPeticionCierre } from '@/lib/tarificador-formador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/tarificador/formador/cierre` — `{ trabajoId, resultado: 'ok'|'error' }`. El worker lo manda
 * ANTES de `/api/tarificador/resultado` (aún `en_curso`). Mueve el contador del modo acompañado UNA vez
 * por trabajo: éxito sin intervención de la IA +1 (al llegar al umbral se desactiva), éxito con IA → 0,
 * fallo → reactivado y 0. Bearer del worker.
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!formadorActivo(process.env)) return NextResponse.json({ estado: 'formador_apagado' })
  const l = leerPeticionCierre(await req.json().catch(() => null))
  if (!l.ok) return NextResponse.json({ estado: 'error', errores: l.errores }, { status: 400 })
  try {
    const t = await trabajoVivo(l.p.trabajoId)
    if (!t) return NextResponse.json({ estado: 'trabajo_no_en_curso' }, { status: 404 })
    const r = await cerrarAcompanamiento(t, l.p.resultado)
    return NextResponse.json({ estado: r.repetido ? 'ya_cerrado' : 'ok', acompanamiento: r.estado })
  } catch (e) {
    console.error('[tarificador/formador] cierre', l.p.trabajoId, e instanceof Error ? e.message.slice(0, 300) : e)
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
