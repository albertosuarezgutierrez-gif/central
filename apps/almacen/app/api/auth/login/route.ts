import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyPassword, createSessionToken, COOKIE_NAME, COOKIE_OPTS } from '@/lib/auth'

const Body = z.object({ email: z.string().email(), password: z.string().min(1) })

export async function POST(req: NextRequest) {
  const body = Body.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { email, password } = body.data

  // 1) Oficina (tabla cuentas)
  const cuenta = await prisma.cuenta.findFirst({
    where: { email: { equals: email.toLowerCase(), mode: 'insensitive' } },
    select: { id: true, nombre: true, email: true, passwordHash: true },
  })
  if (cuenta && cuenta.passwordHash && (await verifyPassword(password, cuenta.passwordHash))) {
    const { token } = await createSessionToken(cuenta.id, cuenta.email, { tipo: 'oficina' })
    const res = NextResponse.json({ ok: true, nombre: cuenta.nombre, tipo: 'oficina' })
    res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
    return res
  }

  // 2) Empleado (creado por la oficina)
  const emp = await prisma.almacenEmpleado.findFirst({
    where: { usuario: { equals: email.toLowerCase(), mode: 'insensitive' }, activo: true },
    select: { id: true, cuentaId: true, nombre: true, usuario: true, passwordHash: true },
  })
  if (emp && (await verifyPassword(password, emp.passwordHash))) {
    const { token } = await createSessionToken(emp.cuentaId, emp.usuario, { tipo: 'empleado', empId: emp.id })
    const res = NextResponse.json({ ok: true, nombre: emp.nombre, tipo: 'empleado' })
    res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
    return res
  }

  return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 })
}
