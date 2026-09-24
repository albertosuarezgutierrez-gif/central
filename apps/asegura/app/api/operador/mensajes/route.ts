import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { marcarLeidos, mensajesDeFicha, mensajesSinLeer, responder } from '@/lib/mensajes-portal'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Mensajes con el cliente (ASegura OS §Q.7), el lado del corredor.
 *
 *   GET   ?clienteId= → { estado:'ok', mensajes } de esa ficha; sin él, { estado:'ok', pendientes } (sin leer)
 *   POST  { accion:'responder', clienteId, polizaId?, cuerpo, avisar?, hasta?, actor }
 *         → 201 { estado:'enviado', id, aviso } · 404 · 422 invalido|poliza_no_valida
 *         { accion:'leidos', clienteId, hasta } → { estado:'hecho', marcados }
 *   `hasta` = el último mensaje que el corredor tenía en pantalla: lo posterior no se sella.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const clienteId = new URL(req.url).searchParams.get('clienteId')
    if (clienteId === null) return NextResponse.json({ estado: 'ok', pendientes: await mensajesSinLeer(correduria.id) })
    if (!UUID.test(clienteId)) return NextResponse.json({ estado: 'invalido', motivo: 'clienteId no válido' }, { status: 422 })
    return NextResponse.json({ estado: 'ok', mensajes: await mensajesDeFicha(correduria.id, clienteId) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/mensajes', e) }, { status: 500 })
  }
}

const STATUS_RESPUESTA: Record<string, number> = { enviado: 201, no_encontrado: 404, invalido: 422, poliza_no_valida: 422 }

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const clienteId = typeof c?.clienteId === 'string' ? c.clienteId : ''
  const polizaId = typeof c?.polizaId === 'string' && c.polizaId ? c.polizaId : null
  if (!UUID.test(clienteId) || (polizaId !== null && !UUID.test(polizaId))) {
    return NextResponse.json({ estado: 'invalido' }, { status: 422 })
  }
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const hastaTxt = typeof c?.hasta === 'string' ? c.hasta : null
    const hasta = hastaTxt && !Number.isNaN(Date.parse(hastaTxt)) ? new Date(hastaTxt) : null
    if (c?.accion === 'leidos') {
      if (!hasta) return NextResponse.json({ estado: 'invalido', motivo: 'falta hasta' }, { status: 422 })
      return NextResponse.json({ estado: 'hecho', marcados: await marcarLeidos(correduria.id, clienteId, hasta) })
    }
    if (c?.accion !== 'responder') return NextResponse.json({ estado: 'invalido' }, { status: 422 })
    const actor = typeof c.actor === 'string' && c.actor.trim() ? c.actor.trim() : 'corredor'
    const r = await responder(correduria.id, clienteId, polizaId, c.cuerpo, actor, c.avisar === true, hasta)
    return NextResponse.json(r, { status: STATUS_RESPUESTA[r.estado] ?? 500 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/mensajes', e) }, { status: 500 })
  }
})
