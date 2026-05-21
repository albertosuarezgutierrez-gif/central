export const dynamic = 'force-dynamic'

// GET /api/qr/sesiones-preauth
// Devuelve sesiones QR con tarjeta capturada (pre_auth) sin pagar
// Para el panel del owner donde puede cobrar manualmente
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export const runtime = 'nodejs'

const ROLES_PERMITIDOS = ['owner', 'jefe_sala', 'super_admin']

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || !ROLES_PERMITIDOS.includes(session.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  // Sesiones activas con pre-auth completado y sin pagar
  const { data: sesiones, error } = await supabase
    .from('qr_sesiones_cliente')
    .select(`
      id, estado, creado_en, preauth_completado, preauth_payment_method_id,
      total_cobrado, inactividad_alerta_enviada,
      mesas!mesa_id (codigo, nombre)
    `)
    .eq('restaurante_id', restauranteId)
    .eq('preauth_completado', true)
    .eq('estado', 'activa')
    .is('pagado_en', null)
    .order('creado_en', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const ahora = Date.now()
  const resultado = (sesiones || []).map((s: any) => ({
    id: s.id,
    estado: s.estado,
    mesa_codigo: s.mesas?.codigo || '?',
    mesa_nombre: s.mesas?.nombre,
    creado_en: s.creado_en,
    minutos_abierta: Math.floor((ahora - new Date(s.creado_en).getTime()) / 60000),
    inactividad_alertada: s.inactividad_alerta_enviada,
    tiene_tarjeta: !!s.preauth_payment_method_id,
  }))

  return NextResponse.json({ sesiones: resultado })
}
