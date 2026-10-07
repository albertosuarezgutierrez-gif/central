import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { encolarTarificacionComunidad } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/correduria/tarificador/encolar { clienteId, oportunidadId?, riesgo } — pide «Precio Allianz
 * (bot)» de una comunidad. Solo un PRECIO: no emite ni contrata. La compañía y el ramo los fija el
 * servidor; el riesgo lo valida asegura. Reenvía el estado y el JSON de asegura tal cual.
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
  const r = await encolarTarificacionComunidad(clienteId, oportunidadId, b.riesgo as Record<string, unknown>)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
