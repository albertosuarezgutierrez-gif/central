export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerClient } from '@/lib/supabase'
import { firmarSesion } from '@/lib/session-sign'

// Login email + contraseña del super admin. Sustituye en la UI a la llave
// secreta + PIN. Al validar, además de devolver la sesión firmada, pone la
// cookie del escudo (__super_shield) para que las /api/super/* sigan protegidas
// por el middleware (defensa en profundidad) sin tener que tocarlas.

// Rate limiting en memoria: 5 intentos / IP → bloqueo 30 min (igual que super-pin)
const ATTEMPTS = new Map<string, { count: number; until: number }>()
const MAX = 5
const BLOCK_MS = 30 * 60 * 1000

const SUPER_RESTAURANTE_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()

  const rec = ATTEMPTS.get(ip)
  if (rec && rec.count >= MAX && now < rec.until) {
    const mins = Math.ceil((rec.until - now) / 60000)
    return NextResponse.json({ error: 'Bloqueado ' + mins + ' min' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const email = String(body?.email ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')

  const fail = () => {
    const prev = ATTEMPTS.get(ip) ?? { count: 0, until: 0 }
    const newCount = prev.count + 1
    ATTEMPTS.set(ip, { count: newCount, until: newCount >= MAX ? now + BLOCK_MS : prev.until })
    const left = MAX - newCount
    return NextResponse.json(
      { error: left > 0 ? 'Email o contraseña incorrectos' : 'Bloqueado 30 min.' },
      { status: 401 }
    )
  }

  if (!email || !password) return fail()

  const supabase = createServerClient()
  const { data: row } = await supabase
    .from('personal')
    .select('id, nombre, rol, local_id, password_hash, activo')
    .eq('email', email)
    .eq('rol', 'super_admin')
    .eq('activo', true)
    .maybeSingle()

  // Comparamos siempre (haya fila o no) para no filtrar por timing si el email existe.
  const hash = row?.password_hash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva'
  const ok = await bcrypt.compare(password, hash)
  if (!row || !ok) return fail()

  ATTEMPTS.delete(ip)

  const res = NextResponse.json({
    camarero: firmarSesion({
      id: row.id,
      camarero_id: row.id,
      nombre: row.nombre,
      rol: 'super_admin',
      restaurante_id: row.local_id ?? SUPER_RESTAURANTE_ID,
      restaurante_nombre: 'ia.rest',
      seccion_id: null,
      onboarding_completado: true,
    }),
  })

  // Cookie del escudo (mismo bloque que super-shield): compartida entre
  // iarest.es y www, host-only en previews *.vercel.app / localhost.
  const KEY = process.env.SUPER_ACCESS_KEY
  if (KEY) {
    const host = req.nextUrl.hostname
    const cookieDomain = host === 'iarest.es' || host.endsWith('.iarest.es') ? '.iarest.es' : undefined
    res.cookies.set('__super_shield', KEY, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 365, // 1 año
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    })
  }

  return res
}
