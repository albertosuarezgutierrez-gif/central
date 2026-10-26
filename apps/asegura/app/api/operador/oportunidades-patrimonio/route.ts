import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { auditado } from '@/lib/auditoria'
import { colaSenalesPatrimonio, descartarSenal } from '@/lib/patrimonio-senales'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cola «Patrimonio» de /correduria → Gestión (P16, 26/10/2026).
 *
 *   GET  → { estado:'ok', senales } · { estado:'apagado' } (motor apagado: NO se lee la BD, la pantalla lo dice) ·
 *          { estado:'sin_configurar' } · { estado:'error', causa }
 *   POST { id, accion:'descartar', motivo, actor } → { estado:'descartada' } · 404 · 422 · { estado:'apagado' }
 *
 * 🚨 Solo señales ABIERTAS y solo de permiso distinto de `opuesto`. No envía nada a nadie. «Abrir oportunidad» (promover)
 * NO está en esta versión: la oportunidad nace hoy del botón «Pedir precio» del cliente.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    return NextResponse.json(await colaSenalesPatrimonio())
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/oportunidades-patrimonio', e) }, { status: 500 })
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof c?.id === 'string' ? c.id : ''
  if (c?.accion !== 'descartar' || !UUID.test(id)) return NextResponse.json({ estado: 'invalida', motivo: 'accion o id no válidos' }, { status: 422 })
  const motivo = typeof c.motivo === 'string' ? c.motivo : ''
  const actor = typeof c.actor === 'string' && c.actor.trim() ? c.actor.trim() : 'corredor'
  try {
    const r = await descartarSenal(id, motivo, actor)
    const status = r.estado === 'no_encontrada' ? 404 : r.estado === 'invalida' ? 422 : 200
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/oportunidades-patrimonio', e) }, { status: 500 })
  }
})
