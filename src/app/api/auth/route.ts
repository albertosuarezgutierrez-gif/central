export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { firmarSesion } from '@/lib/session-sign'

// Rate limiting: máx 10 intentos/IP en 5 min (protege fuerza bruta de PINs)
const ATTEMPTS = new Map<string, { count: number; until: number }>()
const MAX_ATTEMPTS = 10
const BLOCK_MS = 5 * 60 * 1000

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()

  const rec = ATTEMPTS.get(ip)
  if (rec && rec.count >= MAX_ATTEMPTS && now < rec.until) {
    const mins = Math.ceil((rec.until - now) / 60000)
    return NextResponse.json({ error: `Demasiados intentos. Espera ${mins} min.` }, { status: 429 })
  }

  const body = await req.json()
  const { pin, restaurante_code } = body

  const pinStr = String(pin)
  // PINs de 4-8 dígitos (super_admin usa 8, el resto 4)
  if (!pin || pinStr.length < 4 || pinStr.length > 8) {
    return NextResponse.json({ error: 'PIN inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  let restaurante_id = '00000000-0000-0000-0000-000000000001'
  let restaurante_nombre = 'Restaurante Demo'

  // Resolver restaurante por código si se proporciona
  if (restaurante_code && restaurante_code !== 'ia-rest') {
    const { data: rest } = await supabase
      .rpc('resolve_restaurante', { p_slug_or_code: restaurante_code })

    if (!rest || rest.length === 0) {
      return NextResponse.json({ error: `Restaurante "${restaurante_code}" no encontrado` }, { status: 404 })
    }
    restaurante_id = rest[0].id
    restaurante_nombre = rest[0].nombre
  }

  // Verificar PIN dentro del restaurante usando RPC
  const { data, error } = await supabase
    .rpc('login_pin', { p_restaurante_id: restaurante_id, p_pin: pinStr, p_ip_address: ip })

  // Manejar respuesta de la RPC (ahora incluye rate limit en BD)
  if (error) {
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 500 })
  }

  const result = data?.[0]
  if (!result) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
  }

  // Rate limit desde BD
  if (result.blocked) {
    const mins = result.blocked_until
      ? Math.ceil((new Date(result.blocked_until).getTime() - Date.now()) / 60000)
      : 15
    return NextResponse.json({ error: `Demasiados intentos. Espera ${mins} min.` }, { status: 429 })
  }

  if (!result.success) {
    // También actualizar rate limit en memoria como primera capa
    const prev = ATTEMPTS.get(ip) ?? { count: 0, until: 0 }
    const newCount = prev.count + 1
    ATTEMPTS.set(ip, {
      count: newCount,
      until: newCount >= MAX_ATTEMPTS ? now + BLOCK_MS : prev.until,
    })
    const msg = result.intentos_restantes > 0
      ? `PIN incorrecto (${result.intentos_restantes} intentos restantes)`
      : 'PIN incorrecto'
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  // PIN correcto → limpiar rate limit en memoria
  ATTEMPTS.delete(ip)

  // Leer datos completos del camarero (la RPC solo devuelve campos básicos)
  const rpcResult = data[0]
  const { data: personalData } = await supabase
    .from('personal')
    .select('id, nombre, rol, restaurante_id, seccion_id, puede_comandar, modulos_gestion')
    .eq('id', rpcResult.camarero_id)
    .single()

  const cam = {
    camarero_id:     rpcResult.camarero_id,
    nombre:          personalData?.nombre ?? rpcResult.nombre,
    rol:             personalData?.rol ?? rpcResult.rol,
    restaurante_id:  personalData?.restaurante_id ?? restaurante_id,
    restaurante_nombre: restaurante_nombre,
    seccion_id:      personalData?.seccion_id ?? null,
    puede_comandar:  personalData?.puede_comandar ?? false,
    modulos_gestion: personalData?.modulos_gestion ?? [],
  }

  // Leer onboarding_completado para owners nuevos
  let onboarding_completado: boolean | null = null
  if (cam.rol === 'owner' || cam.rol === 'super_admin') {
    const { data: rest } = await supabase
      .from('restaurantes')
      .select('onboarding_completado')
      .eq('id', cam.restaurante_id)
      .single()
    onboarding_completado = rest?.onboarding_completado ?? false
  }

  return NextResponse.json({
    camarero: firmarSesion({
      id: cam.camarero_id,
      camarero_id: cam.camarero_id,
      nombre: cam.nombre,
      rol: cam.rol,
      restaurante_id: cam.restaurante_id,
      restaurante_nombre: cam.restaurante_nombre ?? restaurante_nombre,
      seccion_id: cam.seccion_id ?? null,
      puede_comandar: cam.puede_comandar ?? false,
      modulos_gestion: cam.modulos_gestion ?? [],
      onboarding_completado,
    })
  })
}
