import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { COOKIE_EMPLEADO, COOKIE_OPTS_EMPLEADO, firmarSesionEmpleado } from '@/lib/empleado-auth'
import { getIp, rateLimit } from '@/lib/rate-limit'

// Acceso por ENLACE `/e/<acceso_token>` (+ PIN si lo tiene). Se mantiene para los empleados sin
// email; la entrada normal es `/e/entrar` (email + código). Misma sesión de 90 días revocable.
export async function POST(req: Request) {
  // Tope por IP (best-effort): el PIN son pocos dígitos y aquí no había ninguno.
  if (!rateLimit(`login-enlace:${getIp(req)}`, 30, 15 * 60 * 1000).allowed) {
    return NextResponse.json({ error: 'Demasiados intentos, espera unos minutos' }, { status: 429 })
  }
  const { token, pin } = await req.json().catch(() => ({}))
  if (!token) return NextResponse.json({ error: 'Falta token' }, { status: 400 })
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, empresa_id, pin_hash, sesion_version FROM rrhh.empleados WHERE acceso_token = ${String(token)} AND estado = 'activo' LIMIT 1`)
  const e = rows[0]
  if (!e) return NextResponse.json({ error: 'Acceso no válido' }, { status: 401 })
  if (e.pin_hash) {
    if (!pin || !(await bcrypt.compare(String(pin), e.pin_hash))) return NextResponse.json({ error: 'PIN incorrecto', necesita_pin: true }, { status: 401 })
  }
  const cookie = await firmarSesionEmpleado({ empleado_id: e.id, empresa_id: e.empresa_id, v: Number(e.sesion_version) })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_EMPLEADO, cookie, COOKIE_OPTS_EMPLEADO)
  return res
}
