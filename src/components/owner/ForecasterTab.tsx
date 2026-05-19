'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'
import { useEffect, useState } from 'react'


const NIVEL_BG: Record<string, string>    = { bajo: '#1F1A15', medio: 'rgba(232,163,59,0.08)', alto: 'rgba(217,68,43,0.08)' }
const NIVEL_COLOR: Record<string, string> = { bajo: C.ink4,    medio: C.amber,                alto: C.red }

const TIPO_EMOJI: Record<string, string> = {
  concierto: '🎵', deportes: '⚽', feria: '🎡', festival: '🎪', clima: '🌦', otro: '📅',
}

interface DiaPrediccion   { dia: string; comandas_esperadas: number; revenue_estimado: number; nivel: string; consejo: string }
interface Prediccion       { prediccion_semana: DiaPrediccion[]; producto_estrella_semana: string; dia_mas_fuerte: string; alerta: string | null; consejo_stock: string }
interface Evento           { id: string; nombre: string; fecha_inicio: string; tipo: string; fuente: string; aforo_estimado: number | null; impacto_estimado: number; venue_nombre: string | null }
interface DataType         { historico: { resumeDias: { dia: string; comandas_media: number; revenue_media: number }[]; topProductos: [string, number][]; horaPico: string; totalComandas: number }; prediccion: Prediccion | null; eventos: Evento[] }

function ImpactoBadge({ impacto, tipo }: { impacto: number; tipo: string }) {
  if (tipo === 'clima' && impacto < 1) {
    const pct = Math.round((1 - impacto) * 100)
    return (
      <span style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: 'rgba(43,106,158,0.1)', color: C.blue }}>
        −{pct}%
      </span>
    )
  }
  const pct   = Math.round((impacto - 1) * 100)
  const color = pct > 30 ? { bg: 'rgba(217,68,43,0.1)', fg: C.red } : pct > 15 ? { bg: 'rgba(232,163,59,0.12)', fg: C.amber } : { bg: 'rgba(63,125,68,0.1)', fg: C.green }
  return (
    <span style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: color.bg, color: color.fg }}>
      +{pct}%
    </span>
  )
}

export default function ForecasterTab({ sh }: { sh: () => Record<string, string> }) {
  const [data, setData]       = useState<DataType | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState('')

  useEffect(() => {
    fetch('/api/owner/forecaster', { headers: sh() })
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setData(d) })
      .catch(() => setErr('Error cargando forecaster'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <div style={{ color: C.ink3, padding: 32, textAlign: 'center', fontFamily: SN, fontSize: 13 }}>Analizando histórico y eventos del entorno…</div>
  if (err)     return <div style={{ color: C.amber, padding: 24, fontFamily: SN, fontSize: 13 }}>{err}</div>

  const p  = data?.prediccion
  const ev = data?.eventos ?? []

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Cabecera */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: SE, fontSize: 22, color: C.ink, margin: '0 0 4px 0', fontStyle: 'italic' }}>Forecaster IA</h2>
        <p style={{ fontFamily: SN, fontSize: 12, color: C.ink3, margin: 0 }}>
          Predicción próximos 7 días · {data?.historico.totalComandas} comandas analizadas
          {ev.length > 0 && ` · ${ev.length} evento${ev.length > 1 ? 's' : ''} en tu zona`}
        </p>
      </div>

      {/* Alerta IA */}
      {p?.alerta && (
        <div style={{ background: 'rgba(232,163,59,0.1)', border: `1px solid ${C.amber}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: C.amber, fontSize: 13, fontFamily: SN }}>
          ⚡ {p.alerta}
        </div>
      )}

      {/* KPIs */}
      {p && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Día más fuerte',   valor: p.dia_mas_fuerte },
            { label: 'Producto estrella', valor: p.producto_estrella_semana },
            { label: 'Preparar más',      valor: p.consejo_stock },
          ].map(({ label, valor }) => (
            <div key={label} style={{ flex: 1, minWidth: 150, background: C.bone, borderRadius: 8, padding: '10px 14px', border: `1px solid ${C.rule}` }}>
              <div style={{ fontFamily: SN, color: C.ink4, fontSize: 10, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
              <div style={{ fontFamily: SN, color: C.ink, fontSize: 13, fontWeight: 600 }}>{valor}</div>
            </div>
          ))}
        </div>
      )}

      {/* Predicción por día */}
      {p?.prediccion_semana && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Próximos 7 días</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.prediccion_semana.map((dia) => {
              // ¿Hay evento ese día?
              const eventosDia = ev.filter(e => {
                const fe = new Date(e.fecha_inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
                return dia.dia.toLowerCase().includes(fe.split(',')[0]?.toLowerCase() ?? '')
              })
              return (
                <div key={dia.dia} style={{
                  background: NIVEL_BG[dia.nivel] ?? C.bone, borderRadius: 8,
                  padding: '10px 14px', border: `1px solid ${C.rule}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: SN, color: C.ink, fontSize: 13, fontWeight: 600, minWidth: 110 }}>{dia.dia}</div>
                    <div style={{ fontFamily: SM, color: NIVEL_COLOR[dia.nivel] ?? C.ink3, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', minWidth: 38 }}>{dia.nivel}</div>
                    <div style={{ fontFamily: SM, color: C.ink3, fontSize: 12 }}>~{dia.comandas_esperadas} cmd · ~{dia.revenue_estimado}€</div>
                    <div style={{ fontFamily: SN, color: C.ink4, fontSize: 12, flex: 1, textAlign: 'right', fontStyle: 'italic' }}>{dia.consejo}</div>
                  </div>
                  {eventosDia.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {eventosDia.map(e => (
                        <span key={e.id} style={{ fontFamily: SN, fontSize: 11, color: C.ink3, background: 'rgba(0,0,0,0.04)', padding: '2px 8px', borderRadius: 12, border: `1px solid ${C.rule}` }}>
                          {TIPO_EMOJI[e.tipo] ?? '📅'} {e.nombre}
                          {e.aforo_estimado ? ` · ~${(e.aforo_estimado / 1000).toFixed(0)}k` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Eventos del entorno — sección completa */}
      {ev.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            🗺️ Eventos en tu zona · próximos 14 días
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ev.map(e => {
              const fecha  = new Date(e.fecha_inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: C.bone, borderRadius: 8, border: `1px solid ${C.rule}`, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 18 }}>{TIPO_EMOJI[e.tipo] ?? '📅'}</span>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{e.nombre}</div>
                    <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginTop: 2 }}>
                      {fecha}{e.venue_nombre ? ` · ${e.venue_nombre}` : ''}
                      {e.aforo_estimado ? ` · ~${e.aforo_estimado.toLocaleString('es-ES')} personas` : ''}
                    </div>
                  </div>
                  <ImpactoBadge impacto={e.impacto_estimado} tipo={e.tipo} />
                </div>
              )
            })}
          </div>
          <p style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginTop: 8, fontStyle: 'italic' }}>
            Fuentes: Ticketmaster · Open-Meteo · Actualizado cada mañana a las 08:00h
          </p>
        </div>
      )}

      {ev.length === 0 && (
        <div style={{ marginBottom: 24, padding: '12px 16px', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8 }}>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>🗺️ Eventos en tu zona</div>
          <p style={{ fontFamily: SN, fontSize: 12, color: C.ink4, margin: 0, fontStyle: 'italic' }}>
            Sin eventos detectados próximos. Para activar esta función, configura el código postal de tu local en Ajustes.
          </p>
        </div>
      )}

      {/* Top productos */}
      <div>
        <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Top productos (90 días)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {data?.historico.topProductos?.map(([nombre, uds]: [string, number], i: number) => (
            <span key={nombre} style={{
              background: i === 0 ? 'rgba(217,68,43,0.08)' : C.bone,
              border: `1px solid ${i === 0 ? C.red : C.rule}`,
              color: i === 0 ? C.red : C.ink3,
              fontFamily: SN, fontSize: 12, padding: '4px 10px', borderRadius: 20,
            }}>
              {nombre} · {uds}u
            </span>
          ))}
        </div>
        <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginTop: 12 }}>
          Hora pico: <span style={{ fontFamily: SM, color: C.ink }}>{data?.historico.horaPico}:00h</span>
        </div>
      </div>
    </div>
  )
}
