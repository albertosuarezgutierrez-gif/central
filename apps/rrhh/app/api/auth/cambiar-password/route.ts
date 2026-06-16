import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion, AuthError } from '@/lib/tenant'
import { verifyPassword, hashPassword } from '@/lib/auth'

// POST { actual, nueva } — el responsable cambia su propia contraseña.
export async function POST(req: Request) {
  try {
    const { usuario_id } = await getSesion()
    const { actual, nueva } = await req.json().catch(() => ({}))
    if (String(nueva ?? '').length < 8) {
      return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT pass_hash FROM usuarios_rrhh WHERE id = ${usuario_id}::uuid LIMIT 1`)
    const u = rows[0]
    if (!u || !(await verifyPassword(String(actual ?? ''), u.pass_hash))) {
      return NextResponse.json({ error: 'La contraseña actual no es correcta' }, { status: 400 })
    }
    const pass_hash = await hashPassword(String(nueva))
    await prisma.$executeRaw(Prisma.sql`UPDATE usuarios_rrhh SET pass_hash = ${pass_hash} WHERE id = ${usuario_id}::uuid`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
