import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { firmarSesionEmpleado } from '@/lib/empleado-auth'

// ── Anti-fuerza-bruta del PIN (best-effort, en memoria) ──────────────────────
// El PIN son 4 dígitos (10 000 combinaciones): sin límite, un script prueba todas
// contra un `acceso_token` conocido. Limitamos intentos FALLIDOS por token en una
// ventana; un login correcto limpia el contador. Es best-effort (memoria de la
// instancia serverless caliente, no compartida entre invocaciones frías); frena
// ráfagas sin infra extra. TODO: mover a límite persistente (BD/Upstash) por IP+token.
const RL_VENTANA_MS = 10 * 60_000   // 10 min
const RL_MAX_FALLOS = 10            // 10 intentos fallidos por token y ventana
const rlFallos = new Map<string, number[]>()
function demasiadosFallos(key: string): boolean {
  const ahora = Date.now()
  const prev = (rlFallos.get(key) ?? []).filter(t => ahora - t < RL_VENTANA_MS)
  rlFallos.set(key, prev)
  if (rlFallos.size > 5000) rlFallos.clear()   // evita fuga de memoria
  return prev.length >= RL_MAX_FALLOS
}
function registrarFallo(key: string): void {
  const arr = rlFallos.get(key) ?? []
  arr.push(Date.now())
  rlFallos.set(key, arr)
}

export async function POST(req: Request) {
  const { token, pin } = await req.json().catch(() => ({}))
  if (!token) return NextResponse.json({ error: 'Falta token' }, { status: 400 })
  const rlKey = String(token)
  if (demasiadosFallos(rlKey))
    return NextResponse.json({ error: 'Demasiados intentos, espera unos minutos e inténtalo de nuevo.' }, { status: 429 })
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, empresa_id, pin_hash FROM rrhh.empleados WHERE acceso_token = ${String(token)} AND estado = 'activo' LIMIT 1`)
  const e = rows[0]
  if (!e) { registrarFallo(rlKey); return NextResponse.json({ error: 'Acceso no válido' }, { status: 401 }) }
  if (e.pin_hash) {
    if (!pin || !(await bcrypt.compare(String(pin), e.pin_hash))) {
      registrarFallo(rlKey)
      return NextResponse.json({ error: 'PIN incorrecto', necesita_pin: true }, { status: 401 })
    }
  }
  rlFallos.delete(rlKey)   // login correcto → limpia el contador
  const cookie = await firmarSesionEmpleado({ empleado_id: e.id, empresa_id: e.empresa_id })
  const res = NextResponse.json({ ok: true })
  res.cookies.set('rrhh_empleado', cookie, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
  return res
}
