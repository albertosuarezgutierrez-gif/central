import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { enviarEmailBienvenida } from '@/lib/email'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  // Marcar onboarding como completado
  const { error } = await supabase
    .from('restaurantes')
    .update({ onboarding_completado: true })
    .eq('id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-generar bridge token si no tiene ninguno activo
  const { data: tokenExistente } = await supabase
    .from('bridge_tokens')
    .select('token')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .single()

  let bridgeToken = tokenExistente?.token

  if (!bridgeToken) {
    bridgeToken = crypto.randomBytes(20).toString('hex')
    await supabase.from('bridge_tokens').insert({
      restaurante_id: rid,
      token: bridgeToken,
      activo: true,
      nombre: 'Principal',
    })
  }

  // Obtener email y nombre del restaurante para el email de bienvenida
  try {
    const { data: rest } = await supabase
      .from('restaurantes')
      .select('nombre, email_contacto, cuentas(email)')
      .eq('id', rid)
      .single()

    const email = (rest as any)?.email_contacto || (rest as any)?.cuentas?.email
    const nombre = rest?.nombre || 'tu restaurante'

    if (email && bridgeToken) {
      await enviarEmailBienvenida({ email, nombreRestaurante: nombre, bridgeToken })
    }
  } catch {
    // Email no crítico — no bloqueamos si falla
  }

  return NextResponse.json({ ok: true, bridgeToken })
}
