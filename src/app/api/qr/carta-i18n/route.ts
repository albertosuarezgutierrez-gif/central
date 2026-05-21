export const dynamic = 'force-dynamic'

// app/api/qr/carta-i18n/route.ts
// GET ?token=xxx&lang=en  → carta traducida para el cliente QR
// Auth: valida token contra qr_sesiones_cliente (sin sesión de camarero)

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { IDIOMAS_VALIDOS } from '@/lib/useIdiomasCarta'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    const lang  = req.nextUrl.searchParams.get('lang') ?? 'es'

    if (!token) {
      return NextResponse.json({ error: 'token requerido' }, { status: 400 })
    }

    const idioma = IDIOMAS_VALIDOS.includes(lang as never) ? lang : 'es'
    const supabase = createServerClient()

    // Validar token QR
    const { data: sesion, error: sesErr } = await supabase
      .from('qr_sesiones_cliente')
      .select('restaurante_id, estado')
      .eq('token', token)
      .single()

    if (sesErr || !sesion) {
      return NextResponse.json({ error: 'Token QR inválido' }, { status: 404 })
    }
    if (sesion.estado === 'expirada') {
      return NextResponse.json({ error: 'Sesión QR expirada' }, { status: 410 })
    }

    // Si español, query directa sin RPC para máxima compatibilidad
    if (idioma === 'es') {
      const { data: productos, error: prodErr } = await supabase
        .from('productos')
        .select('id, nombre, descripcion, precio, seccion, categoria, alergenos')
        .eq('restaurante_id', sesion.restaurante_id)
        .eq('activo', true)
        .order('seccion')
        .order('nombre')

      if (prodErr) throw prodErr
      return NextResponse.json({ ok: true, idioma: 'es', productos: productos ?? [] })
    }

    // Otros idiomas: usar RPC con fallback español
    const { data: productos, error: rpcErr } = await supabase
      .rpc('get_carta_i18n', {
        p_restaurante_id: sesion.restaurante_id,
        p_idioma: idioma,
      })

    if (rpcErr) throw rpcErr
    return NextResponse.json({ ok: true, idioma, productos: productos ?? [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
