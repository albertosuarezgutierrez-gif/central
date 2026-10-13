import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { esEntradaNueva } from '@/lib/tarificador-exploraciones'
import { encolarExploracionAsegura, listarExploracionesAsegura } from '@/lib/tarificador-exploraciones-asegura'
import { conCosteReal, costesRealesExploracion } from '@/lib/tarificador-exploraciones-coste'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_STORE = { 'cache-control': 'private, no-store' }

/**
 * GET /api/correduria/tarificador/exploraciones — las exploraciones del EXPLORADOR IA, leídas del puerto de operador de
 * asegura y con el coste REAL de `ai_usos` añadido (`costeRealEur`, `null` si no se pudo leer). Solo lectura.
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await listarExploracionesAsegura()
  const j = r.json as { estado?: string; exploraciones?: { trabajoId: string }[] } | null
  if (r.status !== 200 || !j || !Array.isArray(j.exploraciones)) return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: NO_STORE })
  const costes = await costesRealesExploracion(j.exploraciones.map((e) => e.trabajoId))
  return NextResponse.json({ ...j, exploraciones: conCosteReal(j.exploraciones, costes) }, { status: 200, headers: NO_STORE })
}

/**
 * POST /api/correduria/tarificador/exploraciones { entrada } — «Nueva exploración» (SINTÉTICA: sin cliente). Solo la
 * entrada de la lista cerrada; reenvía a `POST /api/operador/tarificador/exploracion` de asegura, que decide (interruptores,
 * integración, una viva por compañía) y responde 503 `apagado` si el explorador está apagado. Nunca emite.
 */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as { entrada?: unknown } | null
  if (!esEntradaNueva(b?.entrada)) return NextResponse.json({ estado: 'error', mensaje: 'entrada no válida' }, { status: 400 })
  const r = await encolarExploracionAsegura(b.entrada)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: NO_STORE })
}
