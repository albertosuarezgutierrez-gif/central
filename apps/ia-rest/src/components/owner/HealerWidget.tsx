'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'

// ia.rest · src/components/owner/HealerWidget.tsx
// Widget compacto del Auto-Healer para el panel /owner
// Muestra estadísticas de curaciones de los últimos 30 días del restaurante

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  restauranteId: string
}

interface Stats {
  total_30d: number
  auto_resueltas_30d: number
  pendientes: number
  criticas_activas: number
  tasa_auto_pct: number | null
  ultimo_auto_fix: string | null
}

interface Reciente {
  id: string
  tipo: string
  mensaje: string
  auto_resuelta: boolean
  nivel: string
  created_at: string
}


function fmtRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

export default function HealerWidget({ restauranteId }: Props) {
  const [stats, setStats]       = useState<Stats | null>(null)
  const [recientes, setRecientes] = useState<Reciente[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function cargar() {
      setLoading(true)
      // Stats del restaurante
      const { data: s } = await supabase
        .from('v_heal_stats_restaurante')
        .select('*')
        .eq('local_id', restauranteId)
        .maybeSingle()
      setStats(s)

      // Últimas 5 incidencias auto-resueltas
      const { data: r } = await supabase
        .from('incidencias_sistema')
        .select('id, tipo, mensaje, auto_resuelta, nivel, created_at')
        .eq('local_id', restauranteId)
        .order('created_at', { ascending: false })
        .limit(5)
      setRecientes(r ?? [])

      setLoading(false)
    }
    cargar()
  }, [restauranteId])

  if (loading) return null
  if (!stats && recientes.length === 0) return null

  const tasa = stats?.tasa_auto_pct ?? 0
  const hayProblemas = (stats?.criticas_activas ?? 0) > 0 || (stats?.pendientes ?? 0) > 2

  return (
    <div style={{
      background: C.bg2, borderRadius: 12, padding: '16px 18px',
      border: `1px solid ${C.rule}`, fontFamily: SN, marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 15, color: C.ink }}>
            Auto-Healer
          </span>
          {/* Indicator global */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: hayProblemas ? C.amber : C.green,
            boxShadow: `0 0 6px ${hayProblemas ? C.amber : C.green}60`,
          }} />
        </div>
        <span style={{ fontSize: 11, color: C.ink4 }}>Últimos 30 días</span>
      </div>

      {/* KPIs en fila */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: SM, fontSize: 22, fontWeight: 700, color: C.green }}>
            {stats?.auto_resueltas_30d ?? 0}
          </div>
          <div style={{ fontSize: 10, color: C.ink4, marginTop: 2 }}>Auto-resueltas</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: SM, fontSize: 22, fontWeight: 700, color: tasa >= 80 ? C.green : tasa >= 50 ? C.amber : C.red }}>
            {tasa ?? 0}%
          </div>
          <div style={{ fontSize: 10, color: C.ink4, marginTop: 2 }}>Tasa auto-fix</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: SM, fontSize: 22, fontWeight: 700, color: (stats?.pendientes ?? 0) > 0 ? C.amber : C.green }}>
            {stats?.pendientes ?? 0}
          </div>
          <div style={{ fontSize: 10, color: C.ink4, marginTop: 2 }}>Pendientes</div>
        </div>
      </div>

      {/* Críticas activas si las hay */}
      {(stats?.criticas_activas ?? 0) > 0 && (
        <div style={{
          background: C.redS, borderRadius: 6, padding: '6px 10px',
          fontSize: 12, color: C.red, marginBottom: 10, fontWeight: 600,
        }}>
          🔴 {stats!.criticas_activas} incidencia{stats!.criticas_activas > 1 ? 's' : ''} crítica{stats!.criticas_activas > 1 ? 's' : ''} activa{stats!.criticas_activas > 1 ? 's' : ''}
        </div>
      )}

      {/* Último auto-fix */}
      {stats?.ultimo_auto_fix && (
        <div style={{ fontSize: 11, color: C.ink4, marginBottom: 10 }}>
          Último auto-fix: <span style={{ color: C.green }}>{fmtRelativo(stats.ultimo_auto_fix)}</span>
        </div>
      )}

      {/* Recientes */}
      {recientes.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 10 }}>
          <div style={{ fontSize: 10, color: C.ink4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Últimas incidencias
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recientes.map(r => (
              <div key={r.id} style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12,
              }}>
                <span style={{ marginTop: 2, flexShrink: 0 }}>
                  {r.auto_resuelta ? '⚡' : r.nivel === 'critico' ? '🔴' : r.nivel === 'aviso' ? '🟡' : 'ℹ️'}
                </span>
                <span style={{ flex: 1, color: C.ink, lineHeight: 1.3 }}>{r.mensaje}</span>
                <span style={{ color: C.ink4, fontFamily: SM, fontSize: 10, flexShrink: 0 }}>
                  {fmtRelativo(r.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer cuando todo OK */}
      {(stats?.auto_resueltas_30d ?? 0) > 0 && !hayProblemas && (
        <div style={{
          marginTop: 10, borderTop: `1px solid ${C.rule}`, paddingTop: 8,
          fontSize: 11, color: C.green, textAlign: 'center',
        }}>
          ✓ Sistema funcionando correctamente. {stats!.auto_resueltas_30d} incidencias resueltas solas este mes.
        </div>
      )}
    </div>
  )
}
