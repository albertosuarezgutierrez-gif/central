import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// Rate limiting: 5 intentos / IP → bloqueo 30 min
const ATTEMPTS = new Map<string, { count: number; until: number }>()
const MAX = 5
const BLOCK_MS = 30 * 60 * 1000

const SUPER_RESTAURANTE_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(req: NextRequest) {
  // Defense in depth: verificar cookie shield aunque el middleware ya lo hace
  const shield = req.cookies.get('__super_shield')?.value
  const KEY = process.env.SUPER_ACCESS_KEY
  if (!KEY || shield !== KEY) {
    return new NextResponse(null, { status: 404 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()

  const rec = ATTEMPTS.get(ip)
  if (rec && rec.count >= MAX && now < rec.until) {
    const mins = Math.ceil((rec.until - now) / 60000)
    return NextResponse.json({ error: 'Bloqueado ' + mins + ' min' }, { status: 429 })
  }

  const { pin } = await req.json()
  const pinStr = String(pin ?? '')

  if (!pinStr || pinStr.length < 4 || pinStr.length > 8) {
    return NextResponse.json({ error: 'PIN invalido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .rpc('login_pin', { p_restaurante_id: SUPER_RESTAURANTE_ID, p_pin: pinStr })

  const cam = data?.[0]
  if (error || !cam || cam.rol !== 'super_admin') {
    const prev = ATTEMPTS.get(ip) ?? { count: 0, until: 0 }
    const newCount = prev.count + 1
    ATTEMPTS.set(ip, {
      count: newCount,
      until: newCount >= MAX ? now + BLOCK_MS : prev.until,
    })
    const left = MAX - newCount
    return NextResponse.json(
      { error: left > 0 ? 'PIN incorrecto (' + left + ' intentos restantes)' : 'Bloqueado 30 min.' },
      { status: 401 }
    )
  }

  ATTEMPTS.delete(ip)

  return NextResponse.json({
    camarero: {
      id: cam.camarero_id,
      nombre: cam.nombre,
      rol: 'super_admin',
      restaurante_id: cam.restaurante_id,
      restaurante_nombre: cam.restaurante_nombre ?? 'ia.rest',
      seccion_id: null,
      onboarding_completado: true,
    }
  })
}
