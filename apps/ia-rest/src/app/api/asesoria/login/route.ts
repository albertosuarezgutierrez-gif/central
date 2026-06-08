export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { firmarObjeto } from '@/lib/session-sign'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/asesoria/login
 * Body: { email, pin }
 * Autentica a una asesoría/contable y devuelve sus restaurantes clientes.
 */
export async function POST(req: NextRequest) {
  const { email, pin } = await req.json()
  if (!email || !pin) return NextResponse.json({ error: 'email y pin requeridos' }, { status: 400 })

  const supabase = serviceClient()

  const { data: contable } = await supabase
    .from('contables')
    .select('id, nombre, nombre_asesoria, nif_asesoria, telefono, activo')
    .eq('email', email.toLowerCase().trim())
    .eq('pin', pin.trim())
    .single()

  if (!contable) return NextResponse.json({ error: 'Email o PIN incorrectos' }, { status: 401 })
  if (!contable.activo) return NextResponse.json({ error: 'Cuenta desactivada' }, { status: 403 })

  // Cargar restaurantes clientes
  const { data: clientes } = await supabase
    .from('contable_clientes')
    .select('local_id, permisos, restaurantes(id, nombre, ciudad, logo_url)')
    .eq('contable_id', contable.id)
    .eq('activo', true)

  // Actualizar último acceso
  await supabase.from('contables').update({ ultimo_acceso: new Date().toISOString() }).eq('id', contable.id)

  const restaurantes = (clientes ?? []).map(c => ({
    id: (c.restaurantes as unknown as { id: string; nombre: string; ciudad: string; logo_url?: string | null })?.id,
    nombre: (c.restaurantes as unknown as { nombre: string })?.nombre,
    ciudad: (c.restaurantes as unknown as { ciudad?: string })?.ciudad,
    permisos: c.permisos ?? ['ver_resumen', 'ver_303', 'exportar'],
  })).filter(r => r.id)

  return NextResponse.json({
    ok: true,
    session: firmarObjeto({
      contable_id:   contable.id,
      nombre:        contable.nombre,
      nombre_asesoria: contable.nombre_asesoria ?? null,
      email,
      restaurantes,
    }),
  })
}
