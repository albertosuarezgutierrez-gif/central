import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { cerrarAcompanamiento, registrarFallosConocimiento, trabajoVivo } from '@/lib/tarificador-formador'
import { formadorActivo, leerPeticionCierre } from '@/lib/tarificador-formador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/tarificador/formador/cierre` — `{ trabajoId, resultado: 'ok'|'error', aprendidoFallido?: [{clave, tipo, selector}] }`. El worker lo manda
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
    // F2: lo aprendido que falló suma un fallo (2 seguidos = descartado). Solo en el PRIMER cierre (un repetido no cuenta doble).
    // El cierre ya está aplicado: si esto falla NO se tumba la respuesta (un reintento vería `repetido` y no contaría nada). null = no se sabe.
    let fallos: number | null = 0
    if (!r.repetido) {
      try {
        fallos = await registrarFallosConocimiento(t, l.p.aprendidoFallido)
      } catch (e) {
        fallos = null
        console.error('[tarificador/formador] cierre: fallos de lo aprendido', l.p.trabajoId, e instanceof Error ? e.message.slice(0, 300) : 'error')
      }
    }
    return NextResponse.json({ estado: r.repetido ? 'ya_cerrado' : 'ok', acompanamiento: r.estado, aprendidoFallido: fallos })
  } catch (e) {
    console.error('[tarificador/formador] cierre', l.p.trabajoId, e instanceof Error ? e.message.slice(0, 300) : e)
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
