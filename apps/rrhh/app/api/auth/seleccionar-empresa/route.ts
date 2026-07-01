import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { verificarPendiente, firmarSesion } from '@/lib/auth'

export async function POST(req: Request) {
  const pending = (await cookies()).get('rrhh_pending')?.value
  if (!pending) return NextResponse.json({ error: 'Sin sesión pendiente' }, { status: 401 })

  let usuario_id: string
  try { usuario_id = await verificarPendiente(pending) } catch { return NextResponse.json({ error: 'Sesión caducada' }, { status: 401 }) }

  const { empresa_id } = await req.json().catch(() => ({}))
  if (!empresa_id) return NextResponse.json({ error: 'Falta empresa_id' }, { status: 400 })

  // Verificar que el usuario tiene acceso a esa empresa
  const ok = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT 1 FROM rrhh.usuario_empresas WHERE usuario_id = ${usuario_id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1`)
  if (!ok.length) return NextResponse.json({ error: 'Empresa no autorizada' }, { status: 403 })

  const { token, jti } = await firmarSesion({ usuario_id, empresa_id })
  await prisma.$executeRaw(Prisma.sql`UPDATE rrhh.usuarios_rrhh SET session_jti = ${jti} WHERE id = ${usuario_id}::uuid`)

  const res = NextResponse.json({ ok: true })
  res.cookies.delete('rrhh_pending')
  res.cookies.set('rrhh_session', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
  return res
}
