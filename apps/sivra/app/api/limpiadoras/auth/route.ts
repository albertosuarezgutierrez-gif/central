import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'

// ── Rate limiter en memoria (H-02) ──────────────────────────────────────────
// 5 intentos / 15 min por IP. Suficiente para intranet personal.
const attempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000

function getClientIP(req: Request): string {
  const fwd = (req as any).headers?.get?.('x-forwarded-for')
  return (fwd?.split(',')[0] || 'unknown').trim()
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true }
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }
  entry.count++
  return { allowed: true }
}

function clearRateLimit(ip: string) {
  attempts.delete(ip)
}
// ────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const ip = getClientIP(req)
  const rl = checkRateLimit(ip)

  if (!rl.allowed) {
    const mins = Math.ceil((rl.retryAfter || 900) / 60)
    return NextResponse.json(
      { error: `Demasiados intentos. Espera ${mins} min.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )
  }

  const { pin } = await req.json()
  if (!pin || pin.length !== 4) {
    return NextResponse.json({ error: 'PIN inválido' }, { status: 400 })
  }

  try {
    const pinHash = await hashPin(pin)
    const limpiadora = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, nombre, propiedades, color FROM limpiadoras
      WHERE pin_hash = ${pinHash} AND activa = true LIMIT 1
    `)
    if (!limpiadora.length) {
      return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
    }

    clearRateLimit(ip)

    const session = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO limpiadora_sessions (limpiadora_id)
      VALUES (${limpiadora[0].id}::uuid) RETURNING token
    `)

    const res = NextResponse.json({ ok: true, limpiadora: limpiadora[0] })
    res.cookies.set('limpiadora_token', session[0].token, {
      httpOnly: true, secure: true, sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, path: '/',
    })
    return res
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('limpiadora_token')?.value
  if (!token) return NextResponse.json({ limpiadora: null })

  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT l.id, l.nombre, l.propiedades, l.color
      FROM limpiadora_sessions s
      JOIN limpiadoras l ON l.id = s.limpiadora_id
      WHERE s.token = ${token} AND s.expires_at > now() AND l.activa = true
      LIMIT 1
    `)
    return NextResponse.json({ limpiadora: rows[0] || null })
  } catch {
    return NextResponse.json({ limpiadora: null })
  }
}

export async function DELETE() {
  const cookieStore = await cookies()
  const token = cookieStore.get('limpiadora_token')?.value
  if (token) {
    await prisma.$queryRaw(Prisma.sql`
      DELETE FROM limpiadora_sessions WHERE token = ${token}
    `)
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('limpiadora_token')
  return res
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}
