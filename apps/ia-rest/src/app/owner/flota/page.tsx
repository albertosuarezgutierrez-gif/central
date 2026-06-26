'use client'
// Panel del dueño — Flota (solo lectura, ADITIVO). Consume GET /api/owner/flota/resumen
// (que mapea vehiculos_grupo + evento_transporte al modelo de @central/module-flota y calcula
// rentabilidad por vehículo: coste estimado vs real + desviación). No escribe nada.
import { C, SE, SN, SM } from '@/lib/colors'
import { useEffect, useState } from 'react'

interface VehiculoResumen {
  id: string
  nombre: string
  matricula: string | null
  tipo: string
  esPropio: boolean
  nPortes: number
  kmReales: number
  costeEstimado: number
  costeReal: number
  desviacion: number
}
interface Totales {
  vehiculos: number
  portes: number
  costeEstimado: number
  costeReal: number
}

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)

function sesHeader(): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem('ia_rest_session') ?? ''
}
const H = () => ({ 'Content-Type': 'application/json', 'x-ia-session': sesHeader() })

function card(): React.CSSProperties {
  return { background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 14 }
}
function badge(color: string): React.CSSProperties {
  return { display: 'inline-block', fontSize: 10, fontWeight: 700, fontFamily: SM, padding: '2px 7px', borderRadius: 99, background: color + '22', color, border: `1px solid ${color}44` }
}

const TIPO_LABEL: Record<string, string> = {
  furgon: 'Furgón', furgoneta: 'Furgoneta', camion: 'Camión',
  frigorifico: 'Frigorífico', coche: 'Coche', otro: 'Otro',
}

export default function OwnerFlotaPage() {
  const [resumen, setResumen] = useState<VehiculoResumen[]>([])
  const [totales, setTotales] = useState<Totales | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/owner/flota/resumen', { headers: H() })
      .then(async r => {
        if (!r.ok) { setError('No se pudo cargar la flota'); setLoading(false); return }
        const d = await r.json()
        setResumen(d.resumen ?? [])
        setTotales(d.totales ?? null)
        setLoading(false)
      })
      .catch(() => { setError('Error de red'); setLoading(false) })
  }, [])

  const desvColor = (d: number) => (d > 0 ? C.red : d < 0 ? C.green : C.ink3)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SN, color: C.ink, padding: '16px 14px 60px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ fontFamily: SE, fontSize: 26, margin: '4px 0 4px' }}>Flota</h1>
        <p style={{ color: C.ink3, fontSize: 13, margin: '0 0 14px' }}>
          Rentabilidad del transporte por vehículo: coste estimado vs. real y desviación. Solo lectura.
        </p>

        {loading && <p style={{ color: C.ink3 }}>Cargando…</p>}
        {error && !loading && <p style={{ color: C.red }}>{error}</p>}

        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* KPIs */}
            {totales && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {[
                  { label: 'Vehículos', value: String(totales.vehiculos), color: '#2B6A9E' },
                  { label: 'Portes', value: String(totales.portes), color: C.green },
                  { label: 'Coste estimado', value: eur(totales.costeEstimado), color: C.amber },
                  { label: 'Coste real', value: eur(totales.costeReal), color: desvColor(totales.costeReal - totales.costeEstimado) },
                ].map(k => (
                  <div key={k.label} style={{ ...card(), textAlign: 'center' }}>
                    <div style={{ fontFamily: SE, fontSize: 26, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 11, color: C.ink3, marginTop: 2 }}>{k.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Tabla por vehículo */}
            <div style={card()}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Rentabilidad por vehículo</div>
              {resumen.length === 0 ? (
                <p style={{ fontSize: 12, color: C.ink3 }}>
                  No hay vehículos activos con portes registrados. Cuando registres transportes en los
                  eventos, aquí verás la rentabilidad de cada vehículo.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: C.ink3, fontSize: 11 }}>
                        <th style={{ padding: '6px 8px 6px 0', fontWeight: 600 }}>Vehículo</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Portes</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Km</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Estimado</th>
                        <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Real</th>
                        <th style={{ padding: '6px 0 6px 8px', fontWeight: 600, textAlign: 'right' }}>Desviación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.map(v => (
                        <tr key={v.id} style={{ borderTop: `1px solid ${C.rule}` }}>
                          <td style={{ padding: '8px 8px 8px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600 }}>{v.nombre}</span>
                              <span style={badge(v.esPropio ? C.green : '#6B7280')}>{v.esPropio ? 'propio' : 'externo'}</span>
                              <span style={{ fontSize: 11, color: C.ink4, fontFamily: SM }}>{TIPO_LABEL[v.tipo] ?? v.tipo}</span>
                              {v.matricula && <span style={{ fontSize: 11, color: C.ink4, fontFamily: SM }}>{v.matricula}</span>}
                            </div>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: SM }}>{v.nPortes}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: SM, color: C.ink3 }}>{v.kmReales.toLocaleString('es-ES')}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: SM, color: C.amber }}>{eur(v.costeEstimado)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: SM }}>{eur(v.costeReal)}</td>
                          <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', fontFamily: SM, fontWeight: 700, color: desvColor(v.desviacion) }}>
                            {v.desviacion > 0 ? '+' : ''}{eur(v.desviacion)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ fontSize: 11, color: C.ink4, marginTop: 10 }}>
                Desviación = coste real − estimado. <span style={{ color: C.red }}>Rojo</span> = se gastó de más;{' '}
                <span style={{ color: C.green }}>verde</span> = se ahorró.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
