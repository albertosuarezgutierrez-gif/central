import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { firmarSesion, firmarPendiente } from '@/lib/auth'
import { verificarCodigoResponsable } from '@/lib/acceso-responsable'
import { repoResponsable } from '@/lib/acceso-responsable-repo'
import { getIp, rateLimit } from '@/lib/rate-limit'

/**
 * Paso 2 de `/login`: canjea el código del responsable. Una empresa → sesión `rrhh_session`
 * (`typ:'responsable'` + jti, sesión única); varias → cookie `rrhh_pending` (5 min) y el selector
 * de siempre (`/api/auth/seleccionar-empresa`).
 */
export async function POST(req: Request) {
  if (!rateLimit(`acceso-responsable-verificar:${getIp(req)}`, 30, 15 * 60 * 1000).allowed) {
    return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 })
  }
  const body = await req.json().catch(() => null)
  const r = await verificarCodigoResponsable(repoResponsable, { email: body?.email, codigo: body?.codigo })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })

  if (r.paso === 'elegir') {
    const res = NextResponse.json({ ok: true, paso: 'elegir', empresas: r.empresas }, { headers: { 'Cache-Control': 'no-store' } })
    res.cookies.set('rrhh_pending', await firmarPendiente(r.usuario_id), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 300 })
    return res
  }
  const { token, jti } = await firmarSesion({ usuario_id: r.usuario_id, empresa_id: r.empresa_id })
  await prisma.$executeRaw(Prisma.sql`UPDATE rrhh.usuarios_rrhh SET session_jti = ${jti} WHERE id = ${r.usuario_id}::uuid`)
  const res = NextResponse.json({ ok: true, irA: '/admin/empleados' })
  res.cookies.set('rrhh_session', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
  return res
}
