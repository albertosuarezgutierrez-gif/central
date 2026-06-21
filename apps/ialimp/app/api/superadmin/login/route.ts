import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { verifyPassword, createSuperadminToken, hashPassword } from '@/lib/auth'
import { rateLimitHit, rateLimitClear, clientIp } from '@/lib/rate-limit-db'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    // La cuenta más privilegiada del sistema: rate-limit por IP contra fuerza bruta.
    const rlKey = 'sa:' + clientIp(req)
    const rl = await rateLimitHit(rlKey, 5, 15)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Demasiados intentos, espera unos minutos' }, { status: 429 })
    }

    const { email, password } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, email, nombre, password_hash, activo
      FROM superadmins WHERE email = ${email.toLowerCase()} LIMIT 1
    `)
    if (!rows.length) return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 })

    const sa = rows[0]
    if (!sa.activo) return NextResponse.json({ error: 'Cuenta desactivada' }, { status: 403 })

    // First login: set password if placeholder
    if (sa.password_hash.includes('placeholder')) {
      const newHash = await hashPassword(password)
      await prisma.$executeRaw(Prisma.sql`
        UPDATE superadmins SET password_hash = ${newHash} WHERE id = ${sa.id}::uuid
      `)
    } else {
      const ok = await verifyPassword(password, sa.password_hash)
      if (!ok) return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 })
    }

    const token = await createSuperadminToken(sa.id, sa.email)
    const cookieStore = await cookies()
    cookieStore.set('ialimp_session', token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 8, path: '/', sameSite: 'lax'
    })

    await rateLimitClear(rlKey) // login correcto → resetea el contador
    return NextResponse.json({ ok: true, nombre: sa.nombre })
  } catch (e: any) {
    console.error('[superadmin/login]', e?.message)
    return NextResponse.json({ error: 'Error al iniciar sesión' }, { status: 500 })
  }
}
