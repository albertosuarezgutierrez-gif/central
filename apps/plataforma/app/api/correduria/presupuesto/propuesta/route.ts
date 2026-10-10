import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { accionPropuestaAsegura, crearPropuestaAsegura, listarPropuestasAsegura } from '@/lib/propuesta-escenarios-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * /api/correduria/presupuesto/propuesta — la PROPUESTA DE ESCENARIOS (varios presupuestos de una oportunidad).
 * Reenvía al puerto de asegura (`/api/operador/presupuesto/propuesta`) y devuelve el MISMO status y json.
 *
 *   GET   ?oportunidadId=                         → sus propuestas
 *   POST  { oportunidadId, presupuestoIds }       → la prepara como BORRADOR (no avisa a nadie)
 *   PATCH { id, accion:'avisar', canal, confirmar:true } | { id, accion:'confirmar_whatsapp', clienteId } | { id, accion:'retirar' }
 *
 * 🚨 El `actor` lo pone el SERVIDOR con el email de la sesión y va el ÚLTIMO del cuerpo reenviado.
 * 🚨 `confirmar:true` solo lo manda el botón final de Alberto: sin él, asegura no avisa a nadie (428).
 */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const oportunidadId = new URL(req.url).searchParams.get('oportunidadId') ?? ''
  if (!oportunidadId) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  const r = await listarPropuestasAsegura(oportunidadId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!cuerpo) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  const r = await crearPropuestaAsegura({ oportunidadId: cuerpo.oportunidadId, presupuestoIds: cuerpo.presupuestoIds }, guarda.session.email)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function PATCH(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!cuerpo || typeof cuerpo.id !== 'string') return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  // Solo lo que el puerto entiende; nada más viaja (y el `actor`, el último, lo pone el servidor).
  const limpio: Record<string, unknown> = { id: cuerpo.id, accion: cuerpo.accion }
  if (cuerpo.accion === 'avisar') { limpio.canal = cuerpo.canal; limpio.confirmar = cuerpo.confirmar === true }
  // Un botón por tomador: el WhatsApp confirmado es el de ESA ficha, no el de todo el lote.
  if (cuerpo.accion === 'confirmar_whatsapp') limpio.clienteId = typeof cuerpo.clienteId === 'string' ? cuerpo.clienteId : null
  const r = await accionPropuestaAsegura(limpio, guarda.session.email)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
