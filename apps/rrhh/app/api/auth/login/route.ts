import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { verifyPassword, firmarSesion } from '@/lib/auth'

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) return NextResponse.json({ error: 'Faltan credenciales' }, { status: 400 })
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, empresa_id, pass_hash FROM rrhh.usuarios_rrhh WHERE email = ${String(email).toLowerCase()} LIMIT 1`)
  const u = rows[0]
  if (!u || !(await verifyPassword(password, u.pass_hash))) return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
  const { token, jti } = await firmarSesion({ usuario_id: u.id, empresa_id: u.empresa_id })
  await prisma.$executeRaw(Prisma.sql`UPDATE rrhh.usuarios_rrhh SET session_jti = ${jti} WHERE id = ${u.id}::uuid`)
  const res = NextResponse.json({ ok: true })
  res.cookies.set('rrhh_session', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
  return res
}
