import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { crearVistaCorredor } from '@/lib/vista-corredor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * La «vista de corredor» (plataforma → asegura, Bearer).
 *
 *   POST { clienteId, actor } → { estado:'ok', url }  un enlace de UN solo uso
 *                               (10 min) que abre el portal como lo ve ese cliente.
 *
 * No manda nada a nadie: el enlace vuelve a plataforma y lo abre Alberto en su
 * navegador. Por eso no pasa por la regla de comunicaciones salientes y por eso
 * tampoco hay GET: no hay un estado que consultar, solo una acción.
 *
 * Dictado de Alberto (08/09/2026): «el corredor puede acceder a cualquier cosa».
 * Lo que la sesión del corredor NO puede hacer dentro del portal —escribir como
 * el cliente— lo decide el portal, no este puerto.
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body.clienteId !== 'string' || body.clienteId.trim() === '') {
      return NextResponse.json({ estado: 'invalido', motivo: 'falta clienteId' }, { status: 422 })
    }
    const actor = typeof body.actor === 'string' && body.actor.trim() !== '' ? body.actor.trim().slice(0, 120) : 'plataforma'

    const r = await crearVistaCorredor(correduria.id, { clienteId: body.clienteId.trim(), actor })
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok', url: r.url })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/portal/vista', e) }, { status: 500 })
  }
}
