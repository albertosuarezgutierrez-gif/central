import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { completarAcceso } from '@/lib/acceso-email'
import { repoAcceso } from '@/lib/acceso-email-repo'
import { COOKIE_EMPLEADO, COOKIE_OPTS_EMPLEADO, COOKIE_TICKET, firmarSesionEmpleado, verificarTicketAcceso } from '@/lib/empleado-auth'
import { getIp, rateLimit } from '@/lib/rate-limit'

/** Paso 3 de `/e/entrar` (solo con varias empresas o PIN): elige empresa y, si la tiene, PIN. */
export async function POST(req: Request) {
  if (!rateLimit(`acceso-completar:${getIp(req)}`, 30, 15 * 60 * 1000).allowed) {
    return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 })
  }
  const raw = (await cookies()).get(COOKIE_TICKET)?.value
  let ticket
  try { ticket = raw ? await verificarTicketAcceso(raw) : null } catch { ticket = null }
  if (!ticket) return NextResponse.json({ error: 'caducado' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const r = await completarAcceso(repoAcceso, (pin, hash) => bcrypt.compare(pin, hash), ticket,
    { email: body?.email, empleado_id: body?.empleado_id, pin: body?.pin })
  if (!r.ok) return NextResponse.json({ error: r.error, necesita_pin: 'necesita_pin' in r ? r.necesita_pin : undefined }, { status: r.status })
  const c = r.candidato
  const res = NextResponse.json({ ok: true, irA: '/e' })
  res.cookies.set(COOKIE_EMPLEADO, await firmarSesionEmpleado({ empleado_id: c.empleado_id, empresa_id: c.empresa_id, v: Number(c.sesion_version) }), COOKIE_OPTS_EMPLEADO)
  res.cookies.set(COOKIE_TICKET, '', { path: '/api/e/acceso', maxAge: 0 })
  return res
}
