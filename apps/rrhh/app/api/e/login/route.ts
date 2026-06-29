import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { firmarSesionEmpleado } from '@/lib/empleado-auth'

export async function POST(req: Request) {
  const { token, pin } = await req.json().catch(() => ({}))
  if (!token) return NextResponse.json({ error: 'Falta token' }, { status: 400 })
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, empresa_id, pin_hash FROM rrhh.empleados WHERE acceso_token = ${String(token)} AND estado = 'activo' LIMIT 1`)
  const e = rows[0]
  if (!e) return NextResponse.json({ error: 'Acceso no válido' }, { status: 401 })
  if (e.pin_hash) {
    if (!pin || !(await bcrypt.compare(String(pin), e.pin_hash))) return NextResponse.json({ error: 'PIN incorrecto', necesita_pin: true }, { status: 401 })
  }
  const cookie = await firmarSesionEmpleado({ empleado_id: e.id, empresa_id: e.empresa_id })
  const res = NextResponse.json({ ok: true })
  res.cookies.set('rrhh_empleado', cookie, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
  return res
}
