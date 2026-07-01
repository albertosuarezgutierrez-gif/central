import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { verifyPassword, firmarSesion, firmarPendiente } from '@/lib/auth'

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) return NextResponse.json({ error: 'Faltan credenciales' }, { status: 400 })
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, empresa_id, pass_hash FROM rrhh.usuarios_rrhh WHERE email = ${String(email).toLowerCase()} LIMIT 1`)
  const u = rows[0]
  if (!u || !(await verifyPassword(password, u.pass_hash))) return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })

  // Buscar todas las empresas del usuario (tabla n:n + empresa original)
  const empresas = await prisma.$queryRaw<{ id: string; nombre: string }[]>(Prisma.sql`
    SELECT e.id, e.nombre FROM rrhh.empresas e
    JOIN rrhh.usuario_empresas ue ON ue.empresa_id = e.id
    WHERE ue.usuario_id = ${u.id}::uuid
    ORDER BY e.nombre ASC`)

  if (empresas.length > 1) {
    const pending = await firmarPendiente(u.id)
    const res = NextResponse.json({ empresas })
    res.cookies.set('rrhh_pending', pending, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 300 })
    return res
  }

  // Una sola empresa → emitir sesión directamente
  const empresa_id = empresas[0]?.id ?? u.empresa_id
  const { token, jti } = await firmarSesion({ usuario_id: u.id, empresa_id })
  await prisma.$executeRaw(Prisma.sql`UPDATE rrhh.usuarios_rrhh SET session_jti = ${jti} WHERE id = ${u.id}::uuid`)
  const res = NextResponse.json({ ok: true })
  res.cookies.set('rrhh_session', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
  return res
}
