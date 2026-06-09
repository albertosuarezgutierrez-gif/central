import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyPassword, createSessionToken, COOKIE_NAME, COOKIE_OPTS } from '@/lib/auth'

const Body = z.object({ email: z.string().email(), password: z.string().min(1) })

export async function POST(req: NextRequest) {
  const body = Body.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { email, password } = body.data

  const cuenta = await prisma.cuenta.findFirst({
    where: { email: { equals: email.toLowerCase(), mode: 'insensitive' } },
    select: { id: true, nombre: true, email: true, passwordHash: true },
  })

  if (!cuenta || !cuenta.passwordHash || !(await verifyPassword(password, cuenta.passwordHash))) {
    return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 })
  }

  const { token, jti } = await createSessionToken(cuenta.id, cuenta.email)
  await prisma.cuenta.update({ where: { id: cuenta.id }, data: { sessionJti: jti } })

  const res = NextResponse.json({ ok: true, nombre: cuenta.nombre })
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
  return res
}
