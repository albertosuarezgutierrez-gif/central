import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { prepararPresupuestoDeOfertas } from '@/lib/presupuesto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// La narrativa del estudio se pide a la IA (hasta ~45 s) antes de escribir.
export const maxDuration = 90

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const STATUS: Record<string, number> = {
  no_encontrado: 404, no_encontrada: 404, sin_ofertas: 409, sin_revisar: 409, sin_prima: 409, caducada: 409,
}

/**
 * `POST /api/operador/oportunidad/consolidar` (05/10/2026, F2) — las ofertas REVISADAS de una
 * oportunidad → UN presupuesto de origen `ofertas` (borrador: no sale nada hacia el cliente).
 *
 *   { oportunidadId, ofertaIds?: string[], superficieM2?: number, actor?, correduriaId? }
 *
 * - Sin `ofertaIds`, van todas las ofertas no descartadas. Todas las que van (y la póliza actual viva)
 *   tienen que estar REVISADAS y con prima total: si no, 409 con el detalle.
 * - Una `presupuesto_opcion` por oferta (papel `recomendada` si el corredor la marcó), el estudio
 *   congelado y la narrativa validada contra las cifras de la matriz.
 * - 🚨 SIN tarificación y SIN Codeoscopic: este presupuesto nunca se emite ni se re-tarifica por Avant2.
 *   El envío al cliente sigue siendo el de siempre (`PATCH /api/operador/presupuesto` `accion:'avisar'`),
 *   con el OK de Alberto.
 *
 * Respuesta: `{ estado:'ok', token, presupuesto:{ id, referencia, venceEl, opciones, narrativa, … } }`.
 * El `token` en claro sale UNA vez (en la BD solo su hash).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object' || Array.isArray(b)) return NextResponse.json({ estado: 'error', motivo: 'cuerpo JSON' }, { status: 400 })
  const oportunidadId = typeof b.oportunidadId === 'string' ? b.oportunidadId.trim() : ''
  if (!UUID.test(oportunidadId)) return NextResponse.json({ estado: 'error', motivo: 'falta oportunidadId (uuid)' }, { status: 400 })
  let ofertaIds: string[] | null = null
  if (b.ofertaIds !== undefined && b.ofertaIds !== null) {
    if (!Array.isArray(b.ofertaIds) || b.ofertaIds.length === 0 || b.ofertaIds.length > 20 || !b.ofertaIds.every((x) => typeof x === 'string' && UUID.test(x))) {
      return NextResponse.json({ estado: 'error', motivo: 'ofertaIds tiene que ser una lista de 1 a 20 uuids' }, { status: 400 })
    }
    ofertaIds = [...new Set(b.ofertaIds as string[])]
  }
  let superficieM2: number | null = null
  if (b.superficieM2 !== undefined && b.superficieM2 !== null) {
    if (typeof b.superficieM2 !== 'number' || !Number.isFinite(b.superficieM2) || b.superficieM2 <= 0 || b.superficieM2 > 1_000_000) {
      return NextResponse.json({ estado: 'error', motivo: 'superficieM2 tiene que ser un número positivo' }, { status: 400 })
    }
    superficieM2 = b.superficieM2
  }
  const actor = typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim() : 'plataforma'
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    if (b.correduriaId !== undefined && b.correduriaId !== correduria.id) {
      return NextResponse.json({ estado: 'error', motivo: 'correduriaId no es el de esta correduría' }, { status: 403 })
    }
    const r = await prepararPresupuestoDeOfertas(correduria.id, { oportunidadId, ofertaIds, superficieM2, actor })
    if (r.estado === 'error') return NextResponse.json(r, { status: STATUS[r.motivo] ?? 409 })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('oportunidad/consolidar', e) }, { status: 500 })
  }
})
