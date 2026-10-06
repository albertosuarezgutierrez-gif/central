import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { listarIntervenciones } from '@/lib/tarificador-formador'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/operador/tarificador/intervenciones[?trabajo_id=<uuid>][&limite=100]` — qué ha hecho la IA
 * del formador/acompañante del tarificador RPA (por trabajo o lo último), su coste ESTIMADO, lo aprendido
 * por compañía/ramo y el estado del modo acompañado. Para la intranet (plataforma → /correduria).
 * Bearer de operador; filtrado por correduría; solo lectura. Sin PII (resúmenes ya redactados).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const trabajoId = (q.get('trabajo_id') ?? '').trim() || null
  if (trabajoId && !UUID.test(trabajoId)) return NextResponse.json({ estado: 'error', mensaje: 'trabajo_id no es un uuid' }, { status: 400 })
  const n = Number(q.get('limite') ?? 100)
  const limite = Number.isInteger(n) && n >= 1 && n <= 500 ? n : 100
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await listarIntervenciones(correduria.id, { trabajoId, limite })
    return NextResponse.json(r, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/intervenciones', e) }, { status: 503 })
  }
}
