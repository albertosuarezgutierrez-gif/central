import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET
  || (process.env.NODE_ENV === 'production'
      ? (() => { throw new Error('JWT_SECRET no configurado en producción') })()
      : 'ialimp-dev-secret-change-in-prod')
)

export async function POST() {
  const cookieStore = await cookies()

  // Marcar la sesión como cerrada (sesion_activa=false) para que el próximo login
  // no avise "ya hay una sesión abierta". Best-effort: si el token no es válido,
  // simplemente borramos la cookie. NO tocamos session_jti (la regla de gracia de
  // getSession resucitaría tokens viejos si lo pusiéramos a NULL).
  try {
    const token = cookieStore.get('ialimp_session')?.value
    if (token) {
      const { payload } = await jwtVerify(token, JWT_SECRET)
      const p = payload as any
      if (p.type === 'usuario' && p.usuario_id) {
        await prisma.$executeRaw(Prisma.sql`UPDATE usuarios_empresa SET sesion_activa = false WHERE id = ${p.usuario_id}::uuid`)
      } else if (p.empresa_id) {
        await prisma.$executeRaw(Prisma.sql`UPDATE empresas SET sesion_activa = false WHERE id = ${p.empresa_id}::uuid`)
      }
    }
  } catch {
    // token inválido/caducado → nada que limpiar
  }

  cookieStore.delete('ialimp_session')
  return NextResponse.json({ ok: true })
}
