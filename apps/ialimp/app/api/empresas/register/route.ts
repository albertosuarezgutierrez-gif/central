import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { hashPassword, createSessionToken } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    const { nombre, email, password } = await req.json()
    if (!nombre || !email || !password) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Contraseña mínimo 8 caracteres' }, { status: 400 })

    // Check email duplicado
    const existing = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id FROM empresas WHERE email = ${email.toLowerCase()} LIMIT 1
    `)
    if (existing.length) return NextResponse.json({ error: 'Email ya registrado' }, { status: 409 })

    const password_hash = await hashPassword(password)
    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO empresas (nombre, email, password_hash)
      VALUES (${nombre}, ${email.toLowerCase()}, ${password_hash})
      RETURNING id, nombre, email
    `)

    const empresa = result[0]
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

    return NextResponse.json({ ok: true, empresa }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
