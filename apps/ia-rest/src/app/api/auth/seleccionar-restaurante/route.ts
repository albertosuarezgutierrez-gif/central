export const dynamic = 'force-dynamic'

// POST /api/auth/seleccionar-restaurante
// Después del selector de restaurante → devuelve session completa

import { NextRequest, NextResponse } from 'next/server'
import { firmarSesion, verificarObjeto } from '@/lib/session-sign'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const sb = createServerClient()
  const { cuenta_id, restaurante_id, cuentaSession } = await req.json()
  if (!cuenta_id || !restaurante_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  // Prueba de pertenencia a la cuenta (antes bastaba conocer cuenta_id + restaurante_id
  // para obtener una sesión de OWNER firmada). Vale: (a) el token de cuenta firmado que
  // devuelve /api/auth/pin-cuenta, o (b) una sesión firmada de esa misma cuenta (cambio
  // de restaurante desde /owner).
  const tokenCuentaOk = !!cuentaSession && typeof cuentaSession === 'object'
    && verificarObjeto(cuentaSession) && cuentaSession.cuenta_id === cuenta_id
  const sesion = getSession(req)
  const sesionOk = !!sesion?.cuenta_id && sesion.cuenta_id === cuenta_id
  if (!tokenCuentaOk && !sesionOk) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Verificar que el restaurante pertenece a la cuenta
  const { data: r } = await sb
    .from('restaurantes')
    .select('id, nombre, activo')
    .eq('id', restaurante_id)
    .eq('cuenta_id', cuenta_id)
    .single()

  if (!r || !r.activo) return NextResponse.json({ error: 'Restaurante no válido' }, { status: 403 })

  // Buscar camarero owner
  const { data: cam } = await sb
    .from('personal')
    .select('id, nombre, rol')
    .eq('cuenta_id', cuenta_id)
    .eq('local_id', restaurante_id)
    .eq('rol', 'owner')
    .single()

  return NextResponse.json({
    session: firmarSesion({
      id: cam?.id ?? '',
      camarero_id: cam?.id ?? '',
      nombre: cam?.nombre ?? '',
      rol: 'owner',
      restaurante_id: r.id,
      restaurante_nombre: r.nombre,
      cuenta_id,
    }),
  })
}
