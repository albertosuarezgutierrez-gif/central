import { NextResponse } from 'next/server'
import { ACCIONES_CARTA_MEDIADOR, type AccionCartaMediador } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { accionCarta, cartasDePoliza, cartasPorTramitar } from '@/lib/carta-mediador'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * /api/operador/carta-mediador — las cartas de nombramiento de mediador de una póliza (PR 6).
 *   GET   ?polizaId=  → { estado:'ok', cartas }  (`error` si no se pudo leer: nunca «no hay»)
 *   GET   ?pendientes=1 → { estado:'ok', cartas } las firmadas sin mandar y las enviadas sin respuesta («Hoy»)
 *   PATCH { id, accion:'enviada'|'aceptada'|'rechazada'|'desistida', motivo?, actor }
 * «Enviada» la marca Alberto tras mandarla él: aquí no sale nada hacia la compañía.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const q = new URL(req.url).searchParams
    const polizaId = q.get('polizaId')?.trim() ?? ''
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' })
    if (q.get('pendientes') === '1') {
      const lista = await cartasPorTramitar(correduria.id)
      if (lista === null) return NextResponse.json({ estado: 'error', motivo: 'no se pudieron leer las cartas' })
      return NextResponse.json({ estado: 'ok', cartas: lista })
    }
    const cartas = await cartasDePoliza(correduria.id, polizaId)
    if (cartas === null) return NextResponse.json({ estado: 'error', motivo: 'no se pudieron leer las cartas' })
    return NextResponse.json({ estado: 'ok', cartas })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/carta-mediador', e) })
  }
}

const STATUS = { ok: 200, no_encontrada: 404, no_permitida: 409, invalida: 422 } as const

export const PATCH = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const c = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const id = typeof c?.id === 'string' ? c.id.trim() : ''
    const accion = c?.accion
    if (!id || typeof accion !== 'string' || !(ACCIONES_CARTA_MEDIADOR as readonly string[]).includes(accion)) {
      return NextResponse.json({ estado: 'invalida', motivo: 'Falta la carta o la acción.' }, { status: 422 })
    }
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const actor = typeof c?.actor === 'string' && c.actor.trim() ? c.actor.trim() : 'corredor'
    const r = await accionCarta(correduria.id, id, accion as AccionCartaMediador, typeof c?.motivo === 'string' ? c.motivo : null, actor)
    return NextResponse.json(r, { status: STATUS[r.estado] })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/carta-mediador', e) }, { status: 503 })
  }
})
