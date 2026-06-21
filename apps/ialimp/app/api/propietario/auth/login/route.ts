import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { verifyPassword, createPropietarioToken } from '@/lib/auth'
import { verifyTurnstile } from '@/lib/turnstile'
import { rateLimit, getIp } from '@/lib/propietario-auth'

const GENERIC = 'Email o contraseña incorrectos'

export async function POST(req: Request) {
  const ip = getIp(req)
  const rl = rateLimit('prop-login:' + ip)
  if (!rl.allowed) {
    const mins = Math.ceil((rl.retryAfter || 900) / 60)
    return NextResponse.json({ error: `Demasiados intentos. Espera ${mins} min.` }, { status: 429 })
  }

  try {
    const { email, password, turnstileToken } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    if (!(await verifyTurnstile(turnstileToken, ip))) {
      return NextResponse.json({ error: 'Verificación anti-bot fallida. Recarga la página.' }, { status: 400 })
    }

    const norm = String(email).toLowerCase().trim()
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, empresa_id, nombre, password_hash, activo, login_email
      FROM clientes
      WHERE lower(login_email) = ${norm}
      LIMIT 1
    `)

    if (!rows.length || !rows[0].password_hash) {
      return NextResponse.json({ error: GENERIC }, { status: 401 })
    }
    const c = rows[0]
    if (c.activo === false) {
      return NextResponse.json({ error: 'Cuenta desactivada. Contacta con tu empresa de limpieza.' }, { status: 403 })
    }
    if (!(await verifyPassword(password, c.password_hash))) {
      return NextResponse.json({ error: GENERIC }, { status: 401 })
    }

    const { token, jti } = await createPropietarioToken(c.id, c.empresa_id, c.login_email || norm)
    await prisma.$executeRaw(Prisma.sql`UPDATE clientes SET ultimo_login_at = now(), session_jti = ${jti} WHERE id = ${c.id}::uuid`)
    const store = await cookies()
    store.set('ialimp_prop', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax',
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
