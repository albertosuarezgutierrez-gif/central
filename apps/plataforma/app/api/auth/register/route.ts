import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { hashPassword, createSessionToken, COOKIE_NAME, COOKIE_OPTS } from '@/lib/auth'

const Body = z.object({
  nombre: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  const body = Body.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { nombre, email, password } = body.data

  const existe = await prisma.cuenta.findFirst({
    where: { email: { equals: email.toLowerCase(), mode: 'insensitive' } },
    select: { id: true },
  })
  if (existe) return NextResponse.json({ error: 'Email ya registrado' }, { status: 409 })

  const passwordHash = await hashPassword(password)
  const cuenta = await prisma.cuenta.create({
    data: { nombre, email: email.toLowerCase(), passwordHash },
  })

  const { token, jti } = await createSessionToken(cuenta.id, cuenta.email)
  await prisma.cuenta.update({ where: { id: cuenta.id }, data: { sessionJti: jti } })

  const res = NextResponse.json({ ok: true, nombre: cuenta.nombre }, { status: 201 })
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
  return res
}
