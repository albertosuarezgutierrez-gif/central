export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/bridge/verify
// Usos:
//   1. Wizard verifica token al instalar          → { token }
//   2. Wizard comprueba si bridge ya hace ping    → { token, checkPing: true }

export async function POST(req: Request) {
  try {
    const { token, checkPing } = await req.json()
    if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

    const supabase = createServerClient()

    const { data: bt, error } = await supabase
      .from('bridge_tokens')
      .select('id, restaurante_id, activo, ultimo_ping, restaurantes(nombre)')
      .eq('token', token)
      .eq('activo', true)
      .single()

    if (error || !bt) {
      return NextResponse.json({ error: 'Token no válido o inactivo' }, { status: 401 })
    }

    const restaurante = bt.restaurantes as unknown as { nombre: string } | null

    // Modo checkPing: el wizard del paso 5 comprueba si el bridge ya está conectado
    if (checkPing) {
      const lastPing = bt.ultimo_ping ? new Date(bt.ultimo_ping) : null
      const secsAgo  = lastPing ? (Date.now() - lastPing.getTime()) / 1000 : Infinity
      return NextResponse.json({
        ok: true,
        connected: secsAgo < 15,   // ping en los últimos 15s → bridge activo
        secsAgo: Math.round(secsAgo),
      })
    }

    return NextResponse.json({
      ok: true,
      local_id: bt.restaurante_id,
      nombre: restaurante?.nombre || 'Mi restaurante',
    })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
