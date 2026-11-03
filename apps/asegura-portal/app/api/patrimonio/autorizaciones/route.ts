import { NextResponse } from 'next/server'

import { responderInvitar, responderListar } from '@/lib/patrimonio/autorizar-tercero-api'
import { puertosAutorizarPatrimonio } from '@/lib/patrimonio/autorizar-tercero-bd'
import { ipDe, userAgentDe } from '@/lib/peticiones'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SIN_CACHE = { 'cache-control': 'private, no-store' }

/**
 * `GET /api/patrimonio/autorizaciones` — a quién puede autorizar el titular sobre su patrimonio, a quién ha autorizado, qué
 * invitaciones siguen sin contestar y qué le han dado a él. `POST` — el TITULAR invita por correo: `{ titularClienteId, alcance:
 * 'patrimonio_gestion' | 'patrimonio_total', email, invitadoNombre, mensaje? }`. Quién puede lo decide `responderInvitar` contra
 * `titularesAutorizables` (cookie + `portal_vinculo`): el titular del cuerpo no consulta nada; uno que no es suyo = 404.
 */
export async function GET() {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const r = await responderListar(puertosAutorizarPatrimonio(identidad.id))
  return NextResponse.json(r.body, { status: r.status, headers: SIN_CACHE })
}

export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  // Conceder es del TITULAR: el autorizado puro no tiene nada propio que ceder. Lectura caída → NO. (Quién es titular de QUÉ lo
  // decide `responderInvitar` contra `titularesAutorizables`; esto solo cierra la puerta que el menú no ofrece.)
  if (!(await puertaDeSesion('conceder', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-autorizar:${identidad.id}`, 20, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json(
      { error: 'demasiadas_peticiones' },
      { status: 429, headers: { ...SIN_CACHE, 'retry-after': String(tope.retryAfter ?? 60) } },
    )
  }
  const cuerpo = await req.json().catch(() => null)
  const r = await responderInvitar(
    puertosAutorizarPatrimonio(identidad.id, { ip: ipDe(req), userAgent: userAgentDe(req) }),
    cuerpo,
  )
  return NextResponse.json(r.body, { status: r.status, headers: SIN_CACHE })
}
