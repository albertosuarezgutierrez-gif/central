import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { verifyPassword, createSessionToken } from '@/lib/auth'
import { rateLimitHit, rateLimitClear, clientIp } from '@/lib/rate-limit-db'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    const rlKey = 'admin:' + clientIp(req)
    const rl = await rateLimitHit(rlKey)
    if (!rl.allowed) {
      return NextResponse.json({ error: `Demasiados intentos. Espera ${Math.ceil((rl.retryAfter || 900) / 60)} min.` }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })
    }

    const { email, password } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const empresas = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, email, password_hash, activa
      FROM empresas WHERE email = ${email.toLowerCase()}
      LIMIT 1
    `)

    if (!empresas.length) return NextResponse.json({ error: 'Email o contraseña incorrectos' }, { status: 401 })
    const empresa = empresas[0]
    if (!empresa.activa) return NextResponse.json({ error: 'Cuenta desactivada' }, { status: 403 })

    const ok = await verifyPassword(password, empresa.password_hash)
    if (!ok) return NextResponse.json({ error: 'Email o contraseña incorrectos' }, { status: 401 })

    await rateLimitClear(rlKey)
    const { token, jti } = await createSessionToken(empresa.id, empresa.email)
    await prisma.$executeRaw(Prisma.sql`UPDATE empresas SET session_jti = ${jti} WHERE id = ${empresa.id}::uuid`)
    const cookieStore = await cookies()
    cookieStore.set('ialimp_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax'
    })

    return NextResponse.json({ ok: true, empresa: { id: empresa.id, nombre: empresa.nombre } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
