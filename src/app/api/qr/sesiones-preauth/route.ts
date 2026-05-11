// GET /api/qr/sesiones-preauth?restaurante_id=xxx
// Devuelve sesiones QR con tarjeta capturada (pre_auth) sin pagar
// Para el panel del owner donde puede cobrar manualmente
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'

async function getRestauranteId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('x-session-token') || req.headers.get('x-ia-session')
  if (!token) return null
  const supabase = createServerClient()
  const { data } = await supabase
    .from('sesiones_activas')
    .select('restaurante_id, rol')
    .eq('token', token)
    .eq('activa', true)
    .single()
  if (!data) return null
  if (!['owner', 'jefe_sala', 'super_admin'].includes(data.rol)) return null
  return data.restaurante_id
}

export async function GET(req: NextRequest) {
  const restauranteId = await getRestauranteId(req)
  if (!restauranteId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

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
    minutos_abierta: (ahora - new Date(s.creado_en).getTime()) / 60000,
    inactividad_alertada: s.inactividad_alerta_enviada,
    tiene_tarjeta: !!s.preauth_payment_method_id,
  }))

  return NextResponse.json({ sesiones: resultado })
}
