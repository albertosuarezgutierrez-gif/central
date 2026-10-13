import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { fichaAsegura } from '@/lib/ficha-asegura'
import { encolarTarificacionComunidad, encolarTarificacionMoto } from '@/lib/tarificador-asegura'
import { poblacionDesdeFicha } from '@/lib/tarificador-asegura-reglas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/correduria/tarificador/encolar { clienteId, oportunidadId?, riesgo } — pide «Precio Allianz
 * (bot)» de una comunidad; con `ramo: 'moto'` el `riesgo` es el FormularioAuto de una moto (13/10/2026). Solo un PRECIO: no emite ni contrata. La compañía y el ramo los fija el
 * servidor; el riesgo lo valida asegura. Reenvía el estado y el JSON de asegura tal cual.
 *
 * Moto (13/10/2026): si el riesgo no trae `poblacion`, se rellena con la población del domicilio de la ficha del cliente,
 * solo si su CP es el del riesgo (`poblacionDesdeFicha`). Mejor esfuerzo: si la ficha no se lee, se encola sin ella (el bot
 * pedirá a una persona si el CP tiene varias). El valor no se registra.
 */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ estado: 'error', mensaje: 'cuerpo JSON requerido' }, { status: 400 })
  const clienteId = typeof b.clienteId === 'string' ? b.clienteId.trim() : ''
  const oportunidadId = b.oportunidadId == null || b.oportunidadId === '' ? null : typeof b.oportunidadId === 'string' ? b.oportunidadId.trim() : false
  if (!UUID.test(clienteId) || oportunidadId === false || (oportunidadId !== null && !UUID.test(oportunidadId))) {
    return NextResponse.json({ estado: 'error', mensaje: 'clienteId/oportunidadId tienen que ser uuid' }, { status: 400 })
  }
  if (!b.riesgo || typeof b.riesgo !== 'object' || Array.isArray(b.riesgo)) {
    return NextResponse.json({ estado: 'error', mensaje: 'falta el riesgo' }, { status: 400 })
  }
  if (b.ramo !== undefined && b.ramo !== 'comunidades' && b.ramo !== 'moto') {
    return NextResponse.json({ estado: 'error', mensaje: 'ramo no soportado (comunidades o moto)' }, { status: 400 })
  }
  let riesgo = b.riesgo as Record<string, unknown>
  if (b.ramo === 'moto' && !(typeof riesgo.poblacion === 'string' && riesgo.poblacion.trim())) {
    const f = await fichaAsegura(clienteId).catch(() => null)
    const poblacion = f?.estado === 'ok' ? poblacionDesdeFicha(riesgo, f.ficha.contacto) : null
    if (poblacion) riesgo = { ...riesgo, poblacion }
  }
  const r = b.ramo === 'moto'
    ? await encolarTarificacionMoto(clienteId, oportunidadId, riesgo)
    : await encolarTarificacionComunidad(clienteId, oportunidadId, b.riesgo as Record<string, unknown>)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
