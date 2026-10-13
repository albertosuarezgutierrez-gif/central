import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { listarExploracionesAsegura } from '@/lib/tarificador-exploraciones-asegura'
import { conCosteReal, costesRealesExploracion } from '@/lib/tarificador-exploraciones-coste'

export const dynamic = 'force-dynamic'

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
