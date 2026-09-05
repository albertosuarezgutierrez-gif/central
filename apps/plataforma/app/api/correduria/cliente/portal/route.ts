import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { invitarPortalAsegura, portalAsegura } from '@/lib/portal-cliente-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/cliente/portal — el acceso de un CLIENTE al portal.
 *
 *   GET  ?clienteId=…   → qué se puede hacer hoy con esa ficha (gratis)
 *   POST { clienteId }  → le manda el correo con el enlace
 *
 * Esta app no toca la BD de la correduría: reenvía al puerto de asegura
 * (`/api/operador/cliente/portal`) con el secreto de operador y devuelve el
 * MISMO status y json, para que la pantalla lea su contrato tal cual (los siete
 * estados del GET y los ocho desenlaces del POST). Sesión de plataforma
 * obligatoria: es la pantalla de Alberto.
 *
 * 🚨 Por qué el GET existe y no basta con el POST: la pantalla tiene que poder
 * decir «ya entra» o «su correo lleva a otra ficha» ANTES de ofrecer un botón.
 * Invitar a quien el portal no sabría vincular es peor que no invitar — recibe
 * el correo, entra y ve una bóveda vacía sin ningún error.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('clienteId') ?? new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  const r = await portalAsegura(id)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

/**
 * 🚨 El `actor` lo pone el SERVIDOR desde la sesión y va el ÚLTIMO del cuerpo
 * que se reenvía: es lo que asegura escribe en `historial_interno` («se le
 * invitó al portal (fulano)»), así que si viajara en el body cualquiera podría
 * firmar el envío con otro nombre — y de paso mandar campos que el puerto no
 * espera. Por eso tampoco hay spread del body: al puerto solo llega el id que
 * se ha validado aquí y quién lo pulsó.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.clienteId !== 'string' || body.clienteId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  }
  const r = await invitarPortalAsegura({ clienteId: body.clienteId.trim(), actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
