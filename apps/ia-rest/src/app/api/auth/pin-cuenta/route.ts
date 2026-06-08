// POST /api/auth/pin-cuenta
// Login por PIN de cuenta → devuelve lista de restaurantes del owner
// Si solo tiene 1 → incluye session completa para ir directo

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { firmarSesion } from '@/lib/session-sign'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const { pin } = await req.json()
  if (!pin) return NextResponse.json({ error: 'PIN requerido' }, { status: 400 })

  // Buscar cuenta por PIN
  const { data: cuenta, error } = await sb
    .from('cuentas')
    .select('id, nombre, estado')
    .eq('pin_cuenta', String(pin))
    .single()

  if (error || !cuenta) return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
  if (cuenta.estado !== 'activo') return NextResponse.json({ error: 'Cuenta suspendida. Contacta con soporte.' }, { status: 403 })

  // Restaurantes de esta cuenta
  const { data: restaurantes } = await sb
    .from('restaurantes')
    .select('id, nombre, ciudad, plan, plan_status, activo, codigo_acceso')
    .eq('cuenta_id', cuenta.id)
    .eq('activo', true)
    .order('nombre')

  if (!restaurantes?.length) {
    return NextResponse.json({ error: 'Esta cuenta no tiene restaurantes activos.' }, { status: 404 })
  }

  // Si solo hay 1 restaurante → construir session directamente
  if (restaurantes.length === 1) {
    const r = restaurantes[0]
    // Buscar el camarero owner del restaurante
    const { data: cam } = await sb
      .from('personal')
      .select('id, nombre, rol')
      .eq('cuenta_id', cuenta.id)
      .eq('local_id', r.id)
      .eq('rol', 'owner')
      .single()

    return NextResponse.json({
      tipo: 'directo',
      session: firmarSesion({
        id: cam?.id ?? '',
        camarero_id: cam?.id ?? '',
        nombre: cam?.nombre ?? cuenta.nombre,
        rol: 'owner',
        restaurante_id: r.id,
        restaurante_nombre: r.nombre,
        cuenta_id: cuenta.id,
      }),
      restaurantes,
    })
  }

  // Múltiples restaurantes → devolver lista para selector
  return NextResponse.json({
    tipo: 'selector',
    cuenta: { id: cuenta.id, nombre: cuenta.nombre },
    restaurantes,
  })
}
