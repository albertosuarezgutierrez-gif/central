'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'

// ia.rest · src/components/AutoCurasPanel.tsx
// Panel Auto-Healer — timeline de curaciones, patrones, estadísticas globales
// v1.0 — 18/05/2026

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)


interface HealStats {
  total_24h: number
  auto_resueltas_24h: number
  criticas_pendientes: number
  pendientes_24h: number
  total_30d: number
  auto_resueltas_30d: number
  tasa_auto_pct: number | null
  tipo_mas_frecuente: string | null
  hora_pico: number | null
}

interface Incidencia {
  id: string
  tipo: string
  modulo: string
  nivel: string
  mensaje: string
  detalle: Record<string, unknown> | null
  restaurante_id: string | null
  resuelta: boolean
  auto_resuelta: boolean
  resuelta_at: string | null
  created_at: string
  restaurantes?: { nombre: string } | null
}

interface Patron {
  tipo: string
  modulo: string
  restaurante_id: string | null
  dia_semana: number
  hora_dia: number
  ocurrencias: number
  ultima_vez: string
}

const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

const MODULO_ICON: Record<string, string> = {
  comanda: '🍽️', bridge: '🖨️', sala: '🪑', fichaje: '⏱️',
  carta: '📋', cobro: '💳', sistema: '⚙️', voz: '🎙️',
}

const NIVEL_DOT: Record<string, string> = {
  critico: C.red, aviso: C.amber, info: C.blue, resuelto: C.green,
}

function fmt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AutoCurasPanel() {
  const [stats, setStats]         = useState<HealStats | null>(null)
  const [timeline, setTimeline]   = useState<Incidencia[]>([])
  const [patrones, setPatrones]   = useState<Patron[]>([])
  const [loading, setLoading]     = useState(true)
  const [triggerando, setTriggerando] = useState(false)
  const [triggerMsg, setTriggerMsg]   = useState('')
  const [filtro, setFiltro]       = useState<'todos' | 'auto' | 'pendientes' | 'criticos'>('todos')

  const cargar = useCallback(async () => {
    setLoading(true)
    const supabase = sb()

    // Stats globales
    const { data: statsData } = await supabase
      .from('v_heal_stats')
      .select('*')
      .maybeSingle()
    setStats(statsData)

    // Timeline últimas 100 incidencias
    const { data: inc } = await supabase
      .from('incidencias_sistema')
      .select('*, restaurantes(nombre)')
      .order('created_at', { ascending: false })
      .limit(100)
    setTimeline(inc ?? [])

    // Patrones (vista)
    const { data: pat } = await supabase
      .from('v_patrones_fallos')
      .select('*')
      .order('ocurrencias', { ascending: false })
      .limit(20)
    setPatrones(pat ?? [])

    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function triggerHealer() {
    setTriggerando(true)
    setTriggerMsg('')
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/monitor-health`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      )
      const data = await res.json()
      setTriggerMsg(`✅ Ejecución completada — modo: ${data.modo}`)
      setTimeout(cargar, 1500)
    } catch {
      setTriggerMsg('❌ Error al ejecutar')
    }
    setTriggerando(false)
  }

  const incFiltradas = timeline.filter(inc => {
    if (filtro === 'auto')      return inc.auto_resuelta
    if (filtro === 'pendientes') return !inc.resuelta
    if (filtro === 'criticos')   return inc.nivel === 'critico'
    return true
  })

  if (loading) return (
    <div style={{ fontFamily: SN, color: C.ink3, padding: 32, textAlign: 'center' }}>
      Cargando datos del Auto-Healer…
    </div>
  )

  const tasa = stats?.tasa_auto_pct ?? 0

  return (
    <div style={{ fontFamily: SN, color: C.ink, maxWidth: 900 }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: SE, fontSize: 24, fontStyle: 'italic', margin: 0, color: C.ink }}>
            Auto-Healer
          </h2>
          <p style={{ fontSize: 13, color: C.ink3, margin: '4px 0 0' }}>
            El sistema se repara solo. Aquí está el registro.
          </p>
        </div>
        <button
          onClick={triggerHealer}
          disabled={triggerando}
          style={{
            background: triggerando ? C.bg3 : C.ink, color: C.bg,
            border: 'none', borderRadius: 8, padding: '8px 16px',
            fontSize: 13, fontFamily: SN, cursor: triggerando ? 'default' : 'pointer',
          }}
        >
          {triggerando ? '⏳ Ejecutando…' : '▶ Ejecutar ahora'}
        </button>
      </div>
      {triggerMsg && (
        <div style={{ background: C.greenS, color: C.green, padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          {triggerMsg}
        </div>
      )}

      {/* ── KPIs ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Auto-resueltas 24h', val: stats?.auto_resueltas_24h ?? 0, color: C.green, bg: C.greenS },
          {
            label: 'Tasa auto-fix 30d',
            val: `${tasa ?? 0}%`,
            color: tasa >= 80 ? C.green : tasa >= 50 ? C.amber : C.red,
            bg: tasa >= 80 ? C.greenS : tasa >= 50 ? C.amberS : C.redS,
          },
          { label: 'Pendientes', val: stats?.pendientes_24h ?? 0, color: stats?.pendientes_24h ? C.amber : C.green, bg: stats?.pendientes_24h ? C.amberS : C.greenS },
          { label: 'Críticas activas', val: stats?.criticas_pendientes ?? 0, color: stats?.criticas_pendientes ? C.red : C.green, bg: stats?.criticas_pendientes ? C.redS : C.greenS },
        ].map(({ label, val, color, bg }) => (
          <div key={label} style={{ background: bg, borderRadius: 10, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontFamily: SM, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 11, color, marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Fila info contextual ──────────────────────────────────── */}
      {(stats?.tipo_mas_frecuente || stats?.hora_pico != null) && (
        <div style={{ background: C.bg2, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.ink3, marginBottom: 20, display: 'flex', gap: 24 }}>
          {stats.tipo_mas_frecuente && (
            <span>📊 Tipo más frecuente: <b style={{ color: C.ink }}>{stats.tipo_mas_frecuente}</b></span>
          )}
          {stats.hora_pico != null && (
            <span>⏰ Hora pico de fallos: <b style={{ color: C.ink }}>{stats.hora_pico}:00 h</b></span>
          )}
          <span>📅 Total 30d: <b style={{ color: C.ink }}>{stats?.total_30d ?? 0}</b> incidencias</span>
        </div>
      )}

      {/* ── Patrones detectados ───────────────────────────────────── */}
      {patrones.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontFamily: SE, fontSize: 16, fontStyle: 'italic', margin: '0 0 12px', color: C.ink }}>
            Patrones detectados
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {patrones.slice(0, 5).map((p, i) => (
              <div key={i} style={{
                background: C.amberS, border: `1px solid ${C.amber}40`,
                borderRadius: 8, padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
              }}>
                <span style={{ fontSize: 18 }}>{MODULO_ICON[p.modulo] ?? '⚙️'}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontFamily: SM, fontSize: 11, color: C.amber, background: C.bg, borderRadius: 4, padding: '1px 5px' }}>
                    {p.tipo}
                  </span>
                  <span style={{ color: C.ink2, marginLeft: 8 }}>
                    Ocurre {p.ocurrencias}× los <b>{DIAS[p.dia_semana]}</b> a las <b>{p.hora_dia}:00h</b>
                  </span>
                </div>
                <span style={{ fontSize: 11, color: C.ink4, fontFamily: SM }}>
                  Última: {fmt(p.ultima_vez)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Timeline de incidencias ───────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontFamily: SE, fontSize: 16, fontStyle: 'italic', margin: 0, color: C.ink }}>
            Timeline de incidencias
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['todos','auto','pendientes','criticos'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                style={{
                  border: `1px solid ${filtro === f ? C.ink : C.rule}`,
                  background: filtro === f ? C.ink : C.bg,
                  color: filtro === f ? C.bg : C.ink3,
                  borderRadius: 6, padding: '4px 10px', fontSize: 11,
                  fontFamily: SN, cursor: 'pointer', fontWeight: filtro === f ? 700 : 400,
                }}
              >
                {f === 'todos' ? 'Todos' : f === 'auto' ? '⚡ Auto-fix' : f === 'pendientes' ? '⏳ Pendientes' : '🔴 Críticos'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {incFiltradas.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: C.ink4, fontSize: 13 }}>
              Ninguna incidencia con este filtro
            </div>
          )}
          {incFiltradas.map(inc => (
            <div key={inc.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 12px', borderRadius: 8,
              background: inc.auto_resuelta ? C.greenS : inc.nivel === 'critico' ? C.redS : inc.nivel === 'aviso' ? C.amberS : C.bg2,
              border: `1px solid ${inc.nivel === 'critico' ? C.red + '30' : inc.nivel === 'aviso' ? C.amber + '30' : C.rule}`,
              opacity: inc.resuelta && !inc.auto_resuelta ? 0.6 : 1,
            }}>
              {/* Dot de nivel */}
              <div style={{
                width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                background: NIVEL_DOT[inc.nivel] ?? C.ink4,
              }} />

              {/* Icono módulo */}
              <span style={{ fontSize: 16, flexShrink: 0 }}>
                {MODULO_ICON[inc.modulo] ?? '⚙️'}
              </span>

              {/* Contenido */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, background: C.bg, borderRadius: 4, padding: '1px 5px' }}>
                    {inc.tipo}
                  </span>
                  {inc.auto_resuelta && (
                    <span style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>⚡ AUTO-FIX</span>
                  )}
                  {inc.restaurantes?.nombre && (
                    <span style={{ fontSize: 11, color: C.ink3 }}>{inc.restaurantes.nombre}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: C.ink, marginTop: 3 }}>{inc.mensaje}</div>
              </div>

              {/* Timestamp */}
              <div style={{ fontSize: 11, color: C.ink4, fontFamily: SM, flexShrink: 0, textAlign: 'right' }}>
                {fmt(inc.created_at)}
                {inc.resuelta_at && (
                  <div style={{ color: C.green }}>✓ {fmt(inc.resuelta_at)}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {incFiltradas.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button
              onClick={cargar}
              style={{
                background: 'none', border: `1px solid ${C.rule}`,
                borderRadius: 6, padding: '6px 16px', fontSize: 12,
                color: C.ink3, cursor: 'pointer', fontFamily: SN,
              }}
            >
              ↻ Actualizar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
