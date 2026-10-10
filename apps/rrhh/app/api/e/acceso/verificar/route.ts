import { NextResponse } from 'next/server'
import { verificarCodigoAcceso } from '@/lib/acceso-email'
import { repoAcceso } from '@/lib/acceso-email-repo'
import { COOKIE_EMPLEADO, COOKIE_OPTS_EMPLEADO, COOKIE_OPTS_TICKET, COOKIE_TICKET, firmarSesionEmpleado, firmarTicketAcceso } from '@/lib/empleado-auth'
import { getIp, rateLimit } from '@/lib/rate-limit'

/** Paso 2 de `/e/entrar`: canjea el código. Un solo empleado sin PIN → sesión; si no → ticket. */
export async function POST(req: Request) {
  // Además del tope de 5 por código: sin esto, pedir y probar en bucle desde una IP no tiene freno.
  if (!rateLimit(`acceso-verificar:${getIp(req)}`, 30, 15 * 60 * 1000).allowed) {
    return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 })
  }
  const body = await req.json().catch(() => null)
  const r = await verificarCodigoAcceso(repoAcceso, { email: body?.email, codigo: body?.codigo })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  if (r.paso === 'sesion') {
    const c = r.candidato
    const res = NextResponse.json({ ok: true, irA: '/e' })
    res.cookies.set(COOKIE_EMPLEADO, await firmarSesionEmpleado({ empleado_id: c.empleado_id, empresa_id: c.empresa_id, v: Number(c.sesion_version) }), COOKIE_OPTS_EMPLEADO)
    return res
  }
  const ticket = await firmarTicketAcceso({ otp_id: r.otp_id, empleados: r.opciones.map(o => o.empleado_id) })
  const res = NextResponse.json({ ok: true, paso: 'elegir', opciones: r.opciones }, { headers: { 'Cache-Control': 'no-store' } })
  res.cookies.set(COOKIE_TICKET, ticket, COOKIE_OPTS_TICKET)
  return res
}
