export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/contrato/aceptar
// Registra la aceptación del contrato SaaS (LSSI art. 27)
export async function POST(req: NextRequest) {
  try {
    const { restaurante_id, email } = await req.json()
    if (!restaurante_id || !email) {
      return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 })
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'desconocida'

    const userAgent = req.headers.get('user-agent') ?? ''

    const sb = createServerClient()

    const { data: rest, error: restErr } = await sb
      .from('restaurantes')
      .select('id')
      .eq('id', restaurante_id)
      .single()

    if (restErr || !rest) {
      return NextResponse.json({ error: 'Restaurante no encontrado' }, { status: 404 })
    }

    const { error: insertErr } = await sb.from('contract_acceptances').insert({
      local_id: restaurante_id,
      email: email.trim().toLowerCase(),
      contract_version: '1.0',
      ip_address: ip,
      user_agent: userAgent,
    })

    if (insertErr) {
      console.error('[contrato/aceptar] insert error:', insertErr.message)
      return NextResponse.json({ error: 'Error al registrar la aceptación' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[contrato/aceptar] error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
