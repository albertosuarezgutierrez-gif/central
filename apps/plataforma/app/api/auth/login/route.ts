import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyPassword, createSessionToken, COOKIE_NAME, COOKIE_OPTS } from '@/lib/auth'
import { findActiveAdminByEmail, createAdminToken, ADMIN_COOKIE, ADMIN_COOKIE_OPTS } from '@/lib/superadmin'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { registrarSesion } from '@/lib/sesiones-db'
import { tgAviso } from '@/lib/telegram/avisos'

const Body = z.object({ email: z.string().email(), password: z.string().min(1) })

export async function POST(req: NextRequest) {
  const body = Body.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { email, password } = body.data

  // Doble llave: por IP (frena un bot torpe) y por email (frena fuerza bruta dirigida
  // a UNA cuenta desde varias IPs). Best-effort por instancia, ver lib/rate-limit.ts.
  const ip = getIp(req)
  const porIp = rateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000)
  const porEmail = rateLimit(`login:email:${email.toLowerCase()}`, 5, 15 * 60 * 1000)
  if (!porIp.allowed || !porEmail.allowed) {
    const retryAfter = Math.max(porIp.retryAfter || 0, porEmail.retryAfter || 0)
    return NextResponse.json(
      { error: 'Demasiados intentos. Inténtalo más tarde.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  const cuenta = await prisma.cuenta.findFirst({
    where: { email: { equals: email.toLowerCase(), mode: 'insensitive' } },
    select: { id: true, nombre: true, email: true, passwordHash: true },
  })

  if (!cuenta || !cuenta.passwordHash || !(await verifyPassword(password, cuenta.passwordHash))) {
    return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 })
  }

  const { token, jti } = await createSessionToken(cuenta.id, cuenta.email)
  await registrarSesion(cuenta.id, jti)

  tgAviso('sistema.acceso-intranet', `🔔 Acceso a la intranet\n${cuenta.nombre} (${cuenta.email})`)
    .catch(() => {})

  const res = NextResponse.json({ ok: true, nombre: cuenta.nombre })
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)

  // Si el mismo email existe como superadmin activo, emitir también la cookie de operador.
  const sa = await findActiveAdminByEmail(cuenta.email)
  if (sa) res.cookies.set(ADMIN_COOKIE, await createAdminToken(sa.id, sa.email, sa.rol), ADMIN_COOKIE_OPTS)

  return res
}
