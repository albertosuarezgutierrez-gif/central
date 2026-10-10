import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { confirmarConocimiento, registrarIntervencion, trabajoVivo } from '@/lib/tarificador-formador'
import { formadorActivo, leerPeticionConfirmar } from '@/lib/tarificador-formador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/tarificador/formador/confirmar` — el worker VALIDÓ un elemento (lista cerrada + guard de
 * emisión) y lo usó sin error: alta en `tarificador_conocimiento` o +1 a sus confirmaciones. Cuerpo
 * `{ trabajoId, compania, ramo, clave, tipo, selector, marco, origen }`. Bearer del worker; solo con el
 * formador encendido y el trabajo `en_curso` de esa compañía/ramo.
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!formadorActivo(process.env)) return NextResponse.json({ estado: 'formador_apagado' })
  const l = leerPeticionConfirmar(await req.json().catch(() => null))
  if (!l.ok) return NextResponse.json({ estado: 'error', errores: l.errores }, { status: 400 })
  const p = l.p
  try {
    const t = await trabajoVivo(p.trabajoId)
    if (!t) return NextResponse.json({ estado: 'trabajo_no_en_curso' }, { status: 404 })
    if (t.compania !== p.compania || t.ramo !== p.ramo) return NextResponse.json({ estado: 'compania_ramo_no_casan' }, { status: 409 })
    const confirmaciones = await confirmarConocimiento(t, p)
    if (confirmaciones === 1) {
      await registrarIntervencion({ trabajo: t, paso: 'formador', tipo: 'confirmacion', llamadaIA: false, resumen: `aprendido ${p.tipo} «${p.clave}» (origen ${p.origen})`, coste: 0 })
    }
    return NextResponse.json({ estado: 'ok', confirmaciones })
  } catch (e) {
    console.error('[tarificador/formador] confirmar', p.trabajoId, e instanceof Error ? e.message.slice(0, 300) : e)
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
