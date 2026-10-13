import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { leerExploracionAsegura, revisarExploracionAsegura } from '@/lib/tarificador-exploraciones-asegura'
import { conCosteReal, costesRealesExploracion } from '@/lib/tarificador-exploraciones-coste'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'cache-control': 'private, no-store' }
type Ctx = { params: Promise<{ id: string }> }

/** GET — la exploración, sus pasos (sin inventario) y el mapa; con el coste real de `ai_usos`. */
export async function GET(_req: Request, ctx: Ctx) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no válido' }, { status: 400 })
  const r = await leerExploracionAsegura(id)
  const j = r.json as { exploracion?: { trabajoId: string } } | null
  if (r.status !== 200 || !j?.exploracion) return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: NO_STORE })
  const costes = await costesRealesExploracion([j.exploracion.trabajoId])
  return NextResponse.json({ ...j, exploracion: conCosteReal([j.exploracion], costes)[0] }, { status: 200, headers: NO_STORE })
}

/** PATCH { estado: 'revisado' | 'descartado' | 'borrador' } — aprobar mapa (solo marca; no genera código), descartar o deshacer. */
export async function PATCH(req: Request, ctx: Ctx) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no válido' }, { status: 400 })
  const b = (await req.json().catch(() => null)) as { estado?: unknown } | null
  if (b?.estado !== 'revisado' && b?.estado !== 'descartado' && b?.estado !== 'borrador') {
    return NextResponse.json({ estado: 'error', mensaje: 'estado tiene que ser revisado, descartado o borrador' }, { status: 400 })
  }
  const r = await revisarExploracionAsegura(id, b.estado)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
