export const dynamic = 'force-dynamic'

// src/app/api/qr/recomendar/route.ts
// GET  ?token=xxx        → { activo, config }  (para gating/UI del QR)
// POST { token, alergenos[], antojo, idioma, comensales } → { activo, platos[] }
// Auth: valida token contra qr_sesiones_cliente (sin sesión de camarero), igual que carta-i18n.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  recomendarPlatos, mergeMaitreConfig, MAITRE_DEFAULTS,
  type PlatoCarta, type MaitreConfig,
} from '@/lib/carta-recomendar'

export const runtime = 'nodejs'
export const maxDuration = 30

async function resolverSesion(token: string | null) {
  if (!token) return { error: NextResponse.json({ error: 'token requerido' }, { status: 400 }) }
  const supabase = createServerClient()
  const { data: sesion } = await supabase
    .from('qr_sesiones_cliente')
    .select('local_id, estado')
    .eq('token', token)
    .single()
  if (!sesion) return { error: NextResponse.json({ error: 'Token QR inválido' }, { status: 404 }) }
  if (sesion.estado === 'expirada') return { error: NextResponse.json({ error: 'Sesión QR expirada' }, { status: 410 }) }
  return { supabase, restauranteId: sesion.local_id as string }
}

async function leerEstado(supabase: ReturnType<typeof createServerClient>, rid: string) {
  const { data } = await supabase
    .from('restaurantes')
    .select('modulos_activos, configuracion')
    .eq('id', rid)
    .single()
  const activos: string[] = data?.modulos_activos ?? []
  const config: MaitreConfig = mergeMaitreConfig(data?.configuracion?.maitre_ia)
  return { activo: activos.includes('carta_ia'), config }
}

// Solo los campos que la UI necesita conocer por adelantado.
function configUI(c: MaitreConfig) {
  return {
    nombre_asistente: c.nombre_asistente,
    permitir_antojo_texto: c.permitir_antojo_texto,
    mostrar_precios: c.mostrar_precios,
  }
}

export async function GET(req: NextRequest) {
  try {
    const r = await resolverSesion(req.nextUrl.searchParams.get('token'))
    if ('error' in r) return r.error
    const { activo, config } = await leerEstado(r.supabase, r.restauranteId)
    return NextResponse.json({ activo, config: activo ? configUI(config) : configUI(MAITRE_DEFAULTS) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const r = await resolverSesion(body.token ?? null)
    if ('error' in r) return r.error

    const { activo, config } = await leerEstado(r.supabase, r.restauranteId)
    if (!activo) return NextResponse.json({ activo: false, platos: [] })

    const { data: productos } = await r.supabase
      .from('productos')
      .select('id, nombre, descripcion, precio, seccion, categoria, alergenos')
      .eq('local_id', r.restauranteId)
      .eq('activo', true)

    const platos = await recomendarPlatos({
      productos: (productos ?? []) as PlatoCarta[],
      alergenos: Array.isArray(body.alergenos) ? body.alergenos.map(String) : [],
      antojo: typeof body.antojo === 'string' ? body.antojo : '',
      idioma: typeof body.idioma === 'string' ? body.idioma : 'es',
      comensales: Number(body.comensales) > 0 ? Number(body.comensales) : 1,
      config,
    })

    return NextResponse.json({ activo: true, platos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
