import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { leerAcompanamiento, leerConocimiento, trabajoVivo } from '@/lib/tarificador-formador'
import { formadorActivo } from '@/lib/tarificador-formador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/tarificador/formador/conocimiento?trabajo_id=<uuid>&compania=allianz&ramo=comunidades` — lo
 * aprendido para la compañía/ramo DEL TRABAJO (que tiene que estar `en_curso` con lease vivo) y si el
 * modo acompañado está activo. Bearer `TARIFICADOR_WORKER_SECRET`. Con el formador apagado responde
 * `{ formadorActivo: false, conocimiento: [], acompanamiento: { activo: false } }` (el worker no hace nada).
 */
export async function GET(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!formadorActivo(process.env)) return NextResponse.json({ formadorActivo: false, conocimiento: [], acompanamiento: { activo: false } })
  const q = new URL(req.url).searchParams
  const trabajoId = (q.get('trabajo_id') ?? '').trim()
  if (!UUID.test(trabajoId)) return NextResponse.json({ estado: 'error', mensaje: 'trabajo_id no es un uuid' }, { status: 400 })
  try {
    const t = await trabajoVivo(trabajoId)
    if (!t) return NextResponse.json({ estado: 'error', mensaje: 'trabajo_no_en_curso' }, { status: 404 })
    const compania = (q.get('compania') ?? t.compania).trim().toLowerCase()
    const ramo = (q.get('ramo') ?? t.ramo).trim()
    if (compania !== t.compania || ramo !== t.ramo) return NextResponse.json({ estado: 'error', mensaje: 'compania_ramo_no_casan' }, { status: 409 })
    const [conocimiento, acomp] = await Promise.all([leerConocimiento(t), leerAcompanamiento(t)])
    return NextResponse.json({ formadorActivo: true, conocimiento, acompanamiento: acomp }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    console.error('[tarificador/formador] conocimiento', trabajoId, e instanceof Error ? e.message.slice(0, 300) : e)
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
