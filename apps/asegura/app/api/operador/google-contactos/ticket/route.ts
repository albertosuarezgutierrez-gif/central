import { NextResponse } from 'next/server'
import { z } from 'zod'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { credencialesGoogle, secretoEstadoGoogle } from '@/lib/google-contactos'
import { firmarTicket } from '@/lib/google-oauth-ticket'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const Cuerpo = z.object({}).strict()

/**
 * POST /api/operador/google-contactos/ticket — ticket de INICIO del OAuth de Google Contacts para el
 * botón «Conectar Google» de plataforma (05/10/2026). Devuelve la URL de
 * `/api/google-contactos/conectar?ticket=…` a la que plataforma manda el navegador.
 *
 * Solo para una PERSONA (`x-actor: humano:<cuentaId>`): el consentimiento de Google lo da un humano,
 * y un cron o un agente no tienen nada que conectar. Ticket HMAC de 2 min, UN SOLO USO (lo consume
 * `conectar`), sin secretos dentro (`lib/google-oauth-ticket.ts`).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => ({})))
  if (!cuerpo.success) return NextResponse.json({ error: 'Cuerpo inválido: {}' }, { status: 400 })
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  if (actor.tipo !== 'humano') return NextResponse.json({ estado: 'actor_no_humano', error: 'Conectar Google lo hace una persona con sesión.' }, { status: 403 })
  let secreto: string
  let redirectUri: string
  try {
    secreto = secretoEstadoGoogle()
    redirectUri = credencialesGoogle().redirectUri
  } catch {
    return NextResponse.json({ estado: 'sin_configurar_google', error: 'Faltan las variables GOOGLE_CONTACTOS_*' }, { status: 503 })
  }
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const { ticket, datos } = firmarTicket({ correduriaId: correduria.id, cuentaId: actor.id }, secreto)
    // Mismo origen que el callback registrado en Google: la cookie del nonce tiene que volver allí.
    const url = new URL('/api/google-contactos/conectar', new URL(redirectUri).origin)
    url.searchParams.set('ticket', ticket)
    return NextResponse.json({ estado: 'ok', url: url.toString(), caduca: new Date(datos.caduca).toISOString() })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/google-contactos/ticket', e) }, { status: 500 })
  }
})
