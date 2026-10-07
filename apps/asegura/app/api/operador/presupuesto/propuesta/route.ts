import { NextResponse } from 'next/server'

import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import {
  MENSAJE_SIN_TABLA_PROPUESTA, avisarPropuesta, confirmarWhatsappPropuesta, crearPropuesta, esSinTablaPropuesta, leerPropuesta,
  listarPropuestas, retirarPropuesta, type FalloPropuesta,
} from '@/lib/propuesta-escenarios'

export const dynamic = 'force-dynamic'
// Avisar un lote corre un `avisarPresupuesto` por escenario (correo incluido).
export const maxDuration = 60

const STATUS: Record<FalloPropuesta, number> = {
  datos_invalidos: 400, no_encontrado: 404, sin_tabla: 503, otra_oportunidad: 422, no_vigente: 409, sin_tarificacion: 422,
  misma_variante: 422, retirada: 409, sin_confirmar: 428,
}

/**
 * PROPUESTA DE ESCENARIOS por el puerto de operador (plataforma → asegura), 07/10/2026.
 *
 *   GET   ?oportunidadId=         → las propuestas de esa oportunidad (vista sin DNI)
 *   GET   ?id=                    → una propuesta
 *   POST  { oportunidadId, presupuestoIds: [≥2], actor } → la prepara como BORRADOR (no avisa a nadie)
 *   PATCH { id, accion:'avisar', canal:'email'|'whatsapp_enlace', confirmar: true, actor } → avisa (lo pulsa Alberto)
 *   PATCH { id, accion:'confirmar_whatsapp', actor } → Alberto dice que los WhatsApp del lote ya salieron
 *   PATCH { id, accion:'retirar', actor }
 *
 * 🚨 Sin la tabla (SQL 2026-10-07e sin aplicar) responde `sin_tabla` 503: NO es «no hay propuestas».
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const u = new URL(req.url)
  const oportunidadId = u.searchParams.get('oportunidadId')
  const id = u.searchParams.get('id')
  if (!oportunidadId && !id) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    if (id) {
      const v = await leerPropuesta(correduria.id, id)
      return v ? NextResponse.json({ estado: 'ok', propuesta: v }) : NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    }
    return NextResponse.json({ estado: 'ok', propuestas: await listarPropuestas(correduria.id, oportunidadId!) })
  } catch (e) {
    if (esSinTablaPropuesta(e)) return NextResponse.json({ estado: 'error', motivo: 'sin_tabla', detalle: MENSAJE_SIN_TABLA_PROPUESTA }, { status: 503 })
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/presupuesto/propuesta', e) }, { status: 500 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const actor = typeof cuerpo?.actor === 'string' ? cuerpo.actor.trim() : ''
  const oportunidadId = typeof cuerpo?.oportunidadId === 'string' ? cuerpo.oportunidadId.trim() : ''
  if (actor === '' || oportunidadId === '') return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const r = await crearPropuesta(correduria.id, { oportunidadId, presupuestoIds: cuerpo?.presupuestoIds, actor })
    return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : STATUS[r.motivo] })
  } catch (e) {
    if (esSinTablaPropuesta(e)) return NextResponse.json({ estado: 'error', motivo: 'sin_tabla', detalle: MENSAJE_SIN_TABLA_PROPUESTA }, { status: 503 })
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/presupuesto/propuesta', e) }, { status: 500 })
  }
})

export const PATCH = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id.trim() : ''
  const actor = typeof cuerpo?.actor === 'string' ? cuerpo.actor.trim() : ''
  if (id === '' || actor === '') return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    if (cuerpo?.accion === 'avisar') {
      const canal = cuerpo.canal === 'email' || cuerpo.canal === 'whatsapp_enlace' ? cuerpo.canal : null
      if (!canal) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
      const r = await avisarPropuesta(correduria.id, { id, canal, actor, confirmar: cuerpo.confirmar })
      // `parcial` = un tomador sí y otro no: 207 para que la pantalla no lo pinte como éxito entero.
      const status = r.estado === 'ok' ? 200 : r.estado === 'parcial' ? 207 : 'motivo' in r ? STATUS[r.motivo] : 409
      return NextResponse.json(r, { status })
    }
    if (cuerpo?.accion === 'confirmar_whatsapp') {
      const r = await confirmarWhatsappPropuesta(correduria.id, { id, actor })
      const status = r.estado === 'ok' ? 200 : r.estado === 'parcial' ? 207 : 'motivo' in r ? STATUS[r.motivo] : 409
      return NextResponse.json(r, { status })
    }
    if (cuerpo?.accion === 'retirar') {
      const r = await retirarPropuesta(correduria.id, { id, actor })
      return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : STATUS[r.motivo] })
    }
    return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  } catch (e) {
    if (esSinTablaPropuesta(e)) return NextResponse.json({ estado: 'error', motivo: 'sin_tabla', detalle: MENSAJE_SIN_TABLA_PROPUESTA }, { status: 503 })
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/presupuesto/propuesta', e) }, { status: 500 })
  }
})
