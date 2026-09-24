import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { anotarBaja, quitarBaja } from '@/lib/formacion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Persona que deja de distribuir (formación IDD).
 *
 *   POST   { persona, desde, actor } → { estado:'hecho' } · 422 invalida
 *   DELETE ?persona= → { estado:'hecho' } · 404 no_encontrado · 422 invalida
 */
async function correduria(): Promise<{ r: NextResponse } | { id: string }> {
  if (!aseguraConfigurada()) return { r: NextResponse.json({ estado: 'sin_configurar' }) }
  const c = await correduriaUnica()
  if (!c) return { r: NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 }) }
  return { id: c.id }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  try {
    const c = await correduria()
    if ('r' in c) return c.r
    const actor = typeof cuerpo?.actor === 'string' && cuerpo.actor.trim() ? cuerpo.actor.trim() : 'corredor'
    const r = await anotarBaja(c.id, cuerpo, actor)
    return NextResponse.json(r, { status: r.estado === 'hecho' ? 200 : 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/formacion/baja', e) }, { status: 500 })
  }
})

export const DELETE = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const c = await correduria()
    if ('r' in c) return c.r
    const r = await quitarBaja(c.id, new URL(req.url).searchParams.get('persona') ?? '')
    return NextResponse.json({ estado: r }, { status: r === 'hecho' ? 200 : r === 'no_encontrado' ? 404 : 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/formacion/baja', e) }, { status: 500 })
  }
})
