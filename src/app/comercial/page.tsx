'use client'
import { useState, useEffect } from 'react'

const C = { dark: '#14110E', bg2: '#1E1A15', bg3: '#2A221A', paper: '#F6F1E7', ink2: '#D8CDB6', ink3: '#9C8E7E', ink4: '#6B5F52', red: '#D9442B', amber: '#E8A33B', green: '#3F7D44', rule: '#2E2720' }

const TABS = ['📋 Briefings', '📅 Agenda', '💰 Comisiones']

interface Briefing { id: string; token: string; estado: string; cliente_nombre?: string; cliente_email?: string; cliente_telefono?: string; respuestas: Record<string, unknown>; precio_estimado_min?: number; precio_estimado_max?: number; score_viabilidad?: number; comercial?: { nombre: string }; completado_at?: string; created_at: string; resumen_ia?: string; alertas_ia?: string[]; precio_estimado_min_val?: number }
interface AgendaItem { id: string; tipo: string; titulo: string; fecha_hora: string; completado: boolean; briefing?: { cliente_nombre: string }; evento?: { cliente_nombre: string } }
interface Comision { id: string; comision_comercial_eur: number; total: number; descuento_aplicado_pct: number; comercial?: { nombre: string }; evento?: { cliente_nombre: string; fecha_evento: string; tipo: string } }

export default function ComercialPage() {
  const [tab, setTab] = useState(0)
  const [briefings, setBriefings] = useState<Briefing[]>([])
  const [agenda, setAgenda] = useState<AgendaItem[]>([])
  const [comisiones, setComisiones] = useState<Comision[]>([])
  const [totalPendiente, setTotalPendiente] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [nuevoLink, setNuevoLink] = useState('')
  const [detalle, setDetalle] = useState<Briefing | null>(null)
  const [convirtiendo, setConvirtiendo] = useState(false)

  useEffect(() => {
    if (tab === 0) cargarBriefings()
    if (tab === 1) cargarAgenda()
    if (tab === 2) cargarComisiones()
  }, [tab])

  const cargarBriefings = async () => {
    setCargando(true)
    const r = await fetch('/api/owner/eventos/briefings')
    const d = await r.json()
    setBriefings(d.briefings || [])
    setCargando(false)
  }

  const cargarAgenda = async () => {
    setCargando(true)
    const r = await fetch('/api/owner/eventos/agenda')
    const d = await r.json()
    setAgenda(d.agenda || [])
    setCargando(false)
  }

  const cargarComisiones = async () => {
    setCargando(true)
    const r = await fetch('/api/owner/eventos/comisiones?estado=pendiente')
    const d = await r.json()
    setComisiones(d.comisiones || [])
    setTotalPendiente(d.total_pendiente || 0)
    setCargando(false)
  }

  const crearBriefing = async () => {
    setCreando(true)
    const r = await fetch('/api/owner/eventos/briefings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    const d = await r.json()
    if (d.url) { setNuevoLink(d.url); cargarBriefings() }
    setCreando(false)
  }

  const convertir = async (id: string) => {
    setConvirtiendo(true)
    const r = await fetch(`/api/owner/eventos/briefings/${id}/convertir`, { method: 'POST' })
    const d = await r.json()
    if (d.ok) { setDetalle(null); cargarBriefings() }
    setConvirtiendo(false)
  }

  const sh = (s: React.CSSProperties) => s

  const estadoColor = (e: string) => e === 'completado' ? C.amber : e === 'convertido' ? C.green : e === 'caducado' ? C.ink4 : C.ink3
  const tipoIcon: Record<string, string> = { seguimiento: '📞', reunion: '🤝', evento: '🎉', llamada: '☎️', email: '📧', otro: '📌' }

  return (
    <div style={sh({ minHeight: '100vh', background: C.dark, fontFamily: 'Inter Tight, sans-serif' })}>
      {/* Header */}
      <div style={sh({ background: C.bg2, borderBottom: `1px solid ${C.rule}`, padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}>
        <div>
          <div style={sh({ color: C.paper, fontWeight: 700, fontSize: '1.05rem' })}>Panel Comercial</div>
          <div style={sh({ color: C.ink3, fontSize: '0.78rem' })}>Gestión de eventos y presupuestos</div>
        </div>
        <button onClick={crearBriefing} disabled={creando}
          style={sh({ padding: '0.6rem 1rem', background: C.red, border: 'none', borderRadius: 8, color: C.paper, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 })}>
          {creando ? '...' : '+ Nuevo briefing'}
        </button>
      </div>

      {/* Link nuevo copiado */}
      {nuevoLink && (
        <div style={sh({ margin: '1rem 1.5rem', padding: '0.9rem 1rem', background: 'rgba(63,125,68,0.15)', border: `1px solid ${C.green}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' })}>
          <span style={sh({ color: C.green, fontSize: '0.85rem', wordBreak: 'break-all' })}>✅ {nuevoLink}</span>
          <button onClick={() => { navigator.clipboard.writeText(nuevoLink); }}
            style={sh({ padding: '0.4rem 0.8rem', background: C.green, border: 'none', borderRadius: 6, color: C.paper, cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' })}>
            📋 Copiar
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={sh({ display: 'flex', borderBottom: `1px solid ${C.rule}`, padding: '0 1.5rem' })}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)}
            style={sh({ padding: '0.85rem 1rem', border: 'none', background: 'transparent', color: tab === i ? C.red : C.ink3, fontFamily: 'Inter Tight, sans-serif', fontSize: '0.88rem', cursor: 'pointer', borderBottom: `2px solid ${tab === i ? C.red : 'transparent'}`, fontWeight: tab === i ? 600 : 400 })}>
            {t}
          </button>
        ))}
      </div>

      <div style={sh({ padding: '1.25rem 1.5rem' })}>
        {cargando && <div style={sh({ color: C.ink3, textAlign: 'center', padding: '2rem' })}>Cargando...</div>}

        {/* TAB BRIEFINGS */}
        {tab === 0 && !cargando && !detalle && (
          <div>
            {briefings.length === 0 && (
              <div style={sh({ textAlign: 'center', padding: '3rem', color: C.ink3 })}>
                <div style={sh({ fontSize: '2rem', marginBottom: '0.5rem' })}>📋</div>
                Sin briefings aún. Crea el primero y envíaselo a tu cliente.
              </div>
            )}
            {briefings.map(b => (
              <div key={b.id} onClick={() => setDetalle(b)}
                style={sh({ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '1rem', marginBottom: '0.75rem', cursor: 'pointer' })}>
                <div style={sh({ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' })}>
                  <div>
                    <div style={sh({ color: C.paper, fontWeight: 600, fontSize: '0.95rem' })}>
                      {b.cliente_nombre || 'Sin nombre'}
                      {b.cliente_email && <span style={sh({ color: C.ink3, fontWeight: 400, fontSize: '0.82rem', marginLeft: '0.5rem' })}>{b.cliente_email}</span>}
                    </div>
                    <div style={sh({ color: C.ink3, fontSize: '0.8rem', marginTop: '0.2rem' })}>
                      {String(b.respuestas.tipo_evento || '—')} · {Number(b.respuestas.adultos) || 0}A
                      {Number(b.respuestas.ninos) > 0 && `+${Number(b.respuestas.ninos)}N`}
                      {b.respuestas.fecha_tentativa ? ` · ${String(b.respuestas.fecha_tentativa)}` : ''}
                    </div>
                  </div>
                  <div style={sh({ textAlign: 'right', flexShrink: 0 })}>
                    <div style={sh({ fontSize: '0.75rem', color: estadoColor(b.estado), fontWeight: 600, textTransform: 'uppercase' })}>{b.estado}</div>
                    {b.score_viabilidad && (
                      <div style={sh({ fontSize: '0.78rem', color: C.ink3, marginTop: '0.2rem' })}>Score: {b.score_viabilidad}/100</div>
                    )}
                  </div>
                </div>
                {b.precio_estimado_min && (
                  <div style={sh({ marginTop: '0.6rem', color: C.amber, fontSize: '0.85rem' })}>
                    ~{b.precio_estimado_min}–{b.precio_estimado_max}€/p estimado
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* DETALLE BRIEFING */}
        {tab === 0 && !cargando && detalle && (
          <div>
            <button onClick={() => setDetalle(null)}
              style={sh({ marginBottom: '1rem', background: 'transparent', border: 'none', color: C.ink2, cursor: 'pointer', fontSize: '0.9rem', padding: 0 })}>
              ← Volver
            </button>

            <div style={sh({ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' })}>
              <h2 style={sh({ color: C.paper, fontSize: '1.15rem', marginBottom: '0.3rem' })}>{detalle.cliente_nombre || 'Sin nombre'}</h2>
              <div style={sh({ color: C.ink3, fontSize: '0.85rem', marginBottom: '1rem' })}>{detalle.cliente_email} · {detalle.cliente_telefono}</div>

              <div style={sh({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1rem' })}>
                {[
                  { k: 'Tipo', v: detalle.respuestas.tipo_evento as string },
                  { k: 'Fecha', v: detalle.respuestas.fecha_tentativa as string },
                  { k: 'Horario', v: detalle.respuestas.horario as string },
                  { k: 'Adultos', v: String(detalle.respuestas.adultos || 0) },
                  { k: 'Niños', v: String(detalle.respuestas.ninos || 0) },
                  { k: 'Modalidad', v: detalle.respuestas.modalidad as string },
                  { k: 'Barra', v: detalle.respuestas.barra_libre as string },
                  { k: 'Presupuesto', v: `${detalle.respuestas.presupuesto_adulto || '?'}€/p` }
                ].map(item => (
                  <div key={item.k} style={sh({ background: C.bg3, borderRadius: 8, padding: '0.6rem' })}>
                    <div style={sh({ color: C.ink4, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' })}>{item.k}</div>
                    <div style={sh({ color: C.ink2, fontSize: '0.88rem', marginTop: '0.2rem' })}>{item.v || '—'}</div>
                  </div>
                ))}
              </div>

              {detalle.resumen_ia && (
                <div style={sh({ background: 'rgba(217,68,43,0.08)', border: `1px solid rgba(217,68,43,0.3)`, borderRadius: 8, padding: '0.9rem', marginBottom: '1rem' })}>
                  <div style={sh({ color: C.red, fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.4rem' })}>ANÁLISIS IA</div>
                  <div style={sh({ color: C.ink2, fontSize: '0.88rem', lineHeight: 1.6 })}>{detalle.resumen_ia}</div>
                  {detalle.precio_estimado_min && (
                    <div style={sh({ marginTop: '0.5rem', color: C.amber, fontSize: '0.88rem', fontWeight: 600 })}>
                      Estimación: {detalle.precio_estimado_min}–{detalle.precio_estimado_max}€/p · Score: {detalle.score_viabilidad}/100
                    </div>
                  )}
                </div>
              )}

              {detalle.alertas_ia && detalle.alertas_ia.length > 0 && (
                <div style={sh({ marginBottom: '1rem' })}>
                  {detalle.alertas_ia.map((a, i) => (
                    <div key={i} style={sh({ color: C.amber, fontSize: '0.82rem', marginBottom: '0.3rem' })}>⚠️ {a}</div>
                  ))}
                </div>
              )}

              {!!detalle.respuestas.observaciones && (
                <div style={sh({ background: C.bg3, borderRadius: 8, padding: '0.75rem', marginBottom: '1rem' })}>
                  <div style={sh({ color: C.ink4, fontSize: '0.72rem', textTransform: 'uppercase', marginBottom: '0.3rem' })}>Observaciones</div>
                  <div style={sh({ color: C.ink2, fontSize: '0.88rem' })}>{String(detalle.respuestas.observaciones)}</div>
                </div>
              )}
            </div>

            {detalle.estado === 'completado' && (
              <button onClick={() => convertir(detalle.id)} disabled={convirtiendo}
                style={sh({ width: '100%', padding: '1rem', background: C.green, border: 'none', borderRadius: 10, color: C.paper, fontSize: '1rem', fontWeight: 700, cursor: 'pointer' })}>
                {convirtiendo ? 'Creando...' : '✅ Convertir en presupuesto'}
              </button>
            )}
          </div>
        )}

        {/* TAB AGENDA */}
        {tab === 1 && !cargando && (
          <div>
            {agenda.length === 0 && (
              <div style={sh({ textAlign: 'center', padding: '3rem', color: C.ink3 })}>
                <div style={sh({ fontSize: '2rem', marginBottom: '0.5rem' })}>📅</div>
                Sin tareas pendientes
              </div>
            )}
            {agenda.map(item => (
              <div key={item.id} style={sh({ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '1rem', marginBottom: '0.6rem', opacity: item.completado ? 0.5 : 1 })}>
                <div style={sh({ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' })}>
                  <span style={sh({ fontSize: '1.2rem', flexShrink: 0 })}>{tipoIcon[item.tipo] || '📌'}</span>
                  <div style={sh({ flex: 1 })}>
                    <div style={sh({ color: C.paper, fontWeight: 600, fontSize: '0.92rem' })}>{item.titulo}</div>
                    <div style={sh({ color: C.ink3, fontSize: '0.78rem', marginTop: '0.2rem' })}>
                      {new Date(item.fecha_hora).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                      {item.briefing && ` · ${item.briefing.cliente_nombre}`}
                    </div>
                  </div>
                  {!item.completado && (
                    <button onClick={async () => {
                      await fetch('/api/owner/eventos/agenda', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, completado: true }) })
                      cargarAgenda()
                    }}
                      style={sh({ padding: '0.3rem 0.6rem', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 6, color: C.ink2, cursor: 'pointer', fontSize: '0.78rem' })}>
                      ✓ Hecho
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB COMISIONES */}
        {tab === 2 && !cargando && (
          <div>
            <div style={sh({ background: 'rgba(63,125,68,0.12)', border: `1px solid ${C.green}`, borderRadius: 10, padding: '1rem', marginBottom: '1.25rem', textAlign: 'center' })}>
              <div style={sh({ color: C.ink3, fontSize: '0.78rem', marginBottom: '0.25rem' })}>COMISIONES PENDIENTES</div>
              <div style={sh({ color: C.green, fontSize: '2rem', fontFamily: 'Newsreader, serif', fontWeight: 600 })}>{totalPendiente.toFixed(2)}€</div>
            </div>

            {comisiones.map(c => (
              <div key={c.id} style={sh({ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '1rem', marginBottom: '0.6rem' })}>
                <div style={sh({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                  <div>
                    <div style={sh({ color: C.paper, fontSize: '0.92rem', fontWeight: 600 })}>{c.evento?.cliente_nombre}</div>
                    <div style={sh({ color: C.ink3, fontSize: '0.78rem' })}>{c.evento?.tipo} · {c.evento?.fecha_evento?.split('T')[0]}</div>
                  </div>
                  <div style={sh({ textAlign: 'right' })}>
                    <div style={sh({ color: C.green, fontWeight: 700 })}>{c.comision_comercial_eur?.toFixed(2)}€</div>
                    <div style={sh({ color: C.ink4, fontSize: '0.75rem' })}>Total evento: {c.total?.toFixed(2)}€</div>
                    {c.descuento_aplicado_pct > 0 && (
                      <div style={sh({ color: C.amber, fontSize: '0.75rem' })}>Desc: {c.descuento_aplicado_pct}%</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
