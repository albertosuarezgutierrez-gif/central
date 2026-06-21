'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'

// ia.rest · src/components/SystemHealth.tsx
// Panel de monitorización — usa tabla incidencias_sistema

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SB_OPTS } from '@/lib/supabase'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    SB_OPTS
)


type Nivel = 'info' | 'aviso' | 'critico' | 'resuelto' | 'todos'

interface Incidencia {
  id: string; tipo: string; modulo: string; nivel: string
  mensaje: string; detalle: Record<string, unknown> | null
  restaurante_id: string | null; resuelta: boolean
  auto_resuelta: boolean; resuelta_at: string | null
  resuelta_por: string | null; created_at: string
  restaurantes?: { nombre: string } | null
}

interface ResumenModulo {
  modulo: string; nivel: string; pendientes: number
  auto_resueltas: number; total: number; ultima_incidencia: string
}

const NIVEL_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  critico:  { label: 'CRÍTICO', color: C.red,   bg: C.redS,   dot: C.red   },
  aviso:    { label: 'AVISO',   color: C.amber, bg: C.amberS, dot: C.amber },
  info:     { label: 'INFO',    color: C.ink3,  bg: C.bg2,    dot: C.ink4  },
  resuelto: { label: 'OK',      color: C.green, bg: C.greenS, dot: C.green },
}

const MODULO_LABEL: Record<string, string> = {
  comanda: '🍽️ Comanda', cobro: '💳 Cobro', bridge: '🖨️ Bridge',
  qr: '📱 QR', ear: '🎙️ Voz', stripe: '💰 Stripe',
  verifactu: '📄 VeriFactu', sesion: '🔐 Sesión',
  sistema: '⚙️ Sistema', cron: '⏱️ Cron',
}

function relativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

interface Props { session: { restaurante_id?: string } | null }

export default function SystemHealth({ session }: Props) {
  const supabase = sb()
  const [incidencias, setIncidencias] = useState<Incidencia[]>([])
  const [resumen, setResumen]         = useState<ResumenModulo[]>([])
  const [loading, setLoading]         = useState(true)
  const [filtroNivel, setFiltroNivel] = useState<Nivel>('todos')
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [expandido, setExpandido]     = useState<string | null>(null)
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const [stats, setStats]             = useState({ total: 0, criticos: 0, auto: 0, pendientes: 0 })

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const { data: res } = await supabase.from('v_incidencias_resumen').select('*')
      setResumen(res ?? [])

      const { data: all } = await supabase
        .from('incidencias_sistema')
        .select('nivel, resuelta, auto_resuelta')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

      if (all) setStats({
        total: all.length,
        criticos: all.filter(r => r.nivel === 'critico').length,
        auto: all.filter(r => r.auto_resuelta).length,
        pendientes: all.filter(r => !r.resuelta).length,
      })

      let q = supabase
        .from('incidencias_sistema')
        .select('*, restaurantes(nombre)')
        .order('created_at', { ascending: false })
        .limit(100)

      if (soloPendientes) q = q.eq('resuelta', false)
      if (filtroNivel !== 'todos') q = q.eq('nivel', filtroNivel)

      const { data: rows } = await q
      setIncidencias((rows as Incidencia[]) ?? [])
    } finally {
      setLoading(false)
    }
  }, [filtroNivel, soloPendientes])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    const ch = supabase
      .channel('incidencias_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incidencias_sistema' }, (p) => {
        const inc = p.new as Incidencia
        setIncidencias(prev => [inc, ...prev])
        setStats(prev => ({
          ...prev, total: prev.total + 1,
          criticos: inc.nivel === 'critico' ? prev.criticos + 1 : prev.criticos,
          pendientes: prev.pendientes + 1,
        }))
        if (inc.nivel === 'critico') {
          document.title = '🔴 Error crítico — ia.rest'
          setTimeout(() => { document.title = 'ia.rest' }, 8000)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function resolver(id: string) {
    setResolviendo(id)
    await supabase.from('incidencias_sistema')
      .update({ resuelta: true, resuelta_at: new Date().toISOString(), resuelta_por: 'alberto' })
      .eq('id', id)
    setResolviendo(null)
    setExpandido(null)
    cargar()
  }

  const filtros: { id: Nivel; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'critico', label: '🔴 Crítico' },
    { id: 'aviso', label: '🟡 Aviso' },
    { id: 'info', label: '🔵 Info' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: SE, fontSize: 22, color: C.ink, margin: 0 }}>Sistema</h2>
          <p style={{ fontFamily: SN, fontSize: 13, color: C.ink4, margin: '4px 0 0' }}>
            Monitorización en tiempo real · Telegram activo · cron cada 5 min
          </p>
        </div>
        <button onClick={cargar} style={{
          fontFamily: SN, fontSize: 12, padding: '7px 14px',
          background: C.bg2, border: `1px solid ${C.rule}`,
          borderRadius: 6, cursor: 'pointer', color: C.ink3,
        }}>↻ Actualizar</button>
      </div>

      {/* Stats 24h */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Total 24h',      value: stats.total,     color: C.ink3  },
          { label: 'Críticos',       value: stats.criticos,  color: C.red   },
          { label: 'Auto-resueltos', value: stats.auto,      color: C.green },
          { label: 'Pendientes',     value: stats.pendientes, color: stats.pendientes > 0 ? C.amber : C.green },
        ].map(s => (
          <div key={s.label} style={{
            background: C.bg2, border: `1px solid ${C.rule}`,
            borderRadius: 10, padding: '14px 16px', textAlign: 'center',
          }}>
            <div style={{ fontFamily: SM, fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Resumen por módulo */}
      {resumen.length > 0 && (
        <div>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.1em', marginBottom: 10 }}>
            POR MÓDULO (24H)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {resumen.map(r => {
              const cfg = NIVEL_CFG[r.nivel] ?? NIVEL_CFG.aviso
              return (
                <div key={`${r.modulo}-${r.nivel}`} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: C.bg2, border: `1px solid ${C.rule}`,
                  borderRadius: 8, padding: '10px 14px',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                  <span style={{ fontFamily: SN, fontSize: 13, color: C.ink2, flex: 1 }}>
                    {MODULO_LABEL[r.modulo] ?? r.modulo}
                  </span>
                  <span style={{ fontFamily: SM, fontSize: 11, color: cfg.color }}>{r.pendientes} pend.</span>
                  <span style={{ fontFamily: SM, fontSize: 11, color: C.green }}>{r.auto_resueltas} auto</span>
                  <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{relativo(r.ultima_incidencia)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {filtros.map(f => (
          <button key={f.id} onClick={() => setFiltroNivel(f.id)} style={{
            fontFamily: SN, fontSize: 12, padding: '5px 12px',
            background: filtroNivel === f.id ? C.ink : C.bg2,
            color: filtroNivel === f.id ? '#fff' : C.ink3,
            border: `1px solid ${filtroNivel === f.id ? C.ink : C.rule}`,
            borderRadius: 20, cursor: 'pointer',
          }}>{f.label}</button>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginLeft: 8 }}>
          <input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} />
          <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Solo pendientes</span>
        </label>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ fontFamily: SN, fontSize: 13, color: C.ink4, textAlign: 'center', padding: 32 }}>Cargando…</div>
      ) : incidencias.length === 0 ? (
        <div style={{
          background: C.greenS, border: `1px solid ${C.green}`,
          borderRadius: 10, padding: '20px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
          <div style={{ fontFamily: SN, fontSize: 14, color: C.green, fontWeight: 600 }}>
            Sin incidencias{soloPendientes ? ' pendientes' : ''}
          </div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 4 }}>
            Cron activo cada 5 minutos
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {incidencias.map(inc => {
            const cfg = NIVEL_CFG[inc.nivel] ?? NIVEL_CFG.aviso
            const open = expandido === inc.id
            return (
              <div key={inc.id} style={{
                border: `1px solid ${inc.resuelta ? C.rule : cfg.dot}`,
                borderRadius: 8, background: inc.resuelta ? C.bg : cfg.bg,
                opacity: inc.resuelta ? 0.6 : 1,
              }}>
                <button onClick={() => setExpandido(open ? null : inc.id)} style={{
                  width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 16px', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontFamily: SM, fontSize: 10, color: cfg.color }}>{cfg.label}</span>
                      <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>{MODULO_LABEL[inc.modulo] ?? inc.modulo}</span>
                      {inc.restaurantes?.nombre && (
                        <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>· {inc.restaurantes.nombre}</span>
                      )}
                      {inc.auto_resuelta && (
                        <span style={{ fontFamily: SM, fontSize: 10, color: C.green }}>· ⚡auto</span>
                      )}
                    </div>
                    <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, wordBreak: 'break-word' }}>
                      {inc.mensaje}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{relativo(inc.created_at)}</div>
                    {inc.resuelta && <div style={{ fontFamily: SM, fontSize: 10, color: C.green, marginTop: 2 }}>✓</div>}
                  </div>
                </button>

                {open && (
                  <div style={{ borderTop: `1px solid ${C.rule}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>ID: {inc.id.substring(0, 8)}</span>
                      <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>tipo: {inc.tipo}</span>
                      <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
                        {new Date(inc.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
                      </span>
                    </div>

                    {inc.detalle && Object.keys(inc.detalle).length > 0 && (
                      <pre style={{
                        fontFamily: SM, fontSize: 11, color: C.ink2,
                        background: C.bg3, borderRadius: 6, padding: 12,
                        overflowX: 'auto', whiteSpace: 'pre-wrap', margin: 0,
                      }}>
                        {JSON.stringify(inc.detalle, null, 2)}
                      </pre>
                    )}

                    {inc.resuelta ? (
                      <div style={{ background: C.greenS, border: `1px solid ${C.green}`, borderRadius: 6, padding: '8px 12px' }}>
                        <span style={{ fontFamily: SM, fontSize: 11, color: C.green }}>
                          {inc.auto_resuelta ? '⚡ Auto-resuelto' : `✓ Resuelto por ${inc.resuelta_por ?? 'alberto'}`}
                          {inc.resuelta_at ? ` · ${relativo(inc.resuelta_at)}` : ''}
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => resolver(inc.id)}
                        disabled={resolviendo === inc.id}
                        style={{
                          alignSelf: 'flex-start', fontFamily: SN, fontSize: 12,
                          padding: '7px 16px', borderRadius: 6,
                          background: resolviendo === inc.id ? C.ink4 : C.green,
                          color: '#fff', border: 'none',
                          cursor: resolviendo === inc.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {resolviendo === inc.id ? 'Marcando…' : '✓ Marcar como resuelto'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
