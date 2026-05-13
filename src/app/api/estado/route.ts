// src/app/api/estado/route.ts
// GET /api/estado — estado público del sistema ia.rest
// Sin autenticación — para la página pública /estado y status.iarest.es (futuro)

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const sb = () => createServerClient()

export const revalidate = 60 // caché 60 segundos en Vercel

export async function GET() {
  const ahora = Date.now()
  const hace1h = new Date(ahora - 60 * 60 * 1000).toISOString()
  const hace24h = new Date(ahora - 24 * 60 * 60 * 1000).toISOString()
  const hace30d = new Date(ahora - 30 * 24 * 60 * 60 * 1000).toISOString()

  try {
    // ── Errores críticos última hora (globales, sin restaurante_id) ──
    const { count: erroresCrit1h } = await sb()
      .from('system_errors')
      .select('id', { count: 'exact', head: true })
      .is('restaurante_id', null)
      .eq('nivel', 'critical')
      .eq('resuelto', false)
      .gte('created_at', hace1h)

    // ── Errores últimas 24h para el historial ──
    const { data: errores24h } = await sb()
      .from('system_errors')
      .select('nivel, created_at, categoria')
      .is('restaurante_id', null)
      .gte('created_at', hace24h)
      .order('created_at', { ascending: false })
      .limit(50)

    // ── Uptime últimos 30 días: días con al menos un error crítico sin resolver ──
    const { data: historialErrores } = await sb()
      .from('system_errors')
      .select('created_at, nivel')
      .is('restaurante_id', null)
      .eq('nivel', 'critical')
      .gte('created_at', hace30d)
      .order('created_at', { ascending: true })

    // Calcular uptime por día (últimos 30 días)
    const diasConIncidencia = new Set<string>()
    for (const e of historialErrores ?? []) {
      const dia = e.created_at.slice(0, 10)
      diasConIncidencia.add(dia)
    }
    const uptimePct = Math.round(((30 - diasConIncidencia.size) / 30) * 100 * 10) / 10

    // ── Determinar estado general ──
    const estadoGeneral: 'operativo' | 'degradado' | 'incidencia' =
      (erroresCrit1h ?? 0) >= 5 ? 'incidencia'
      : (erroresCrit1h ?? 0) >= 1 ? 'degradado'
      : 'operativo'

    // ── Servicios individuales ──
    const servicios = [
      {
        nombre: 'App (TPV)',
        descripcion: 'Panel camarero, KDS, Owner',
        estado: estadoGeneral === 'incidencia' ? 'incidencia'
              : estadoGeneral === 'degradado'  ? 'degradado'
              : 'operativo',
      },
      {
        nombre: 'Reconocimiento de voz (EAR)',
        descripcion: 'Whisper · Groq',
        estado: (errores24h ?? []).some(e => e.categoria === 'ear') ? 'degradado' : 'operativo',
      },
      {
        nombre: 'Interpretación IA (BRAIN)',
        descripcion: 'Claude · Anthropic',
        estado: (errores24h ?? []).some(e => e.categoria === 'brain') ? 'degradado' : 'operativo',
      },
      {
        nombre: 'Base de datos',
        descripcion: 'Supabase · EU West',
        estado: (errores24h ?? []).some(e => e.categoria === 'db') ? 'degradado' : 'operativo',
      },
      {
        nombre: 'Facturación (VeriFactu)',
        descripcion: 'Generación de facturas legales',
        estado: (errores24h ?? []).some(e => e.categoria === 'verifactu') ? 'degradado' : 'operativo',
      },
    ]

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      estado_general: estadoGeneral,
      uptime_30d: uptimePct,
      servicios,
      incidencias_recientes: (errores24h ?? [])
        .filter(e => e.nivel === 'critical')
        .slice(0, 3)
        .map(e => ({
          hora: e.created_at,
          servicio: e.categoria,
        })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
