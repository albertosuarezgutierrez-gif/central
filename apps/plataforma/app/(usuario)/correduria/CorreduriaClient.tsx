'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { companiaLabel, COMPANIA_OTRAS, COMPANIAS_CONOCIDAS } from '@/lib/correduria'
import { eur } from '@/lib/dinero'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function mesKey(año: number, mesIdx: number) {
  return `${año}-${String(mesIdx + 1).padStart(2, '0')}`
}

// Fecha siempre en formato español día/mes/año: "2026-06-03" → "03/06/2026".
function fmtFecha(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

// Destinos a los que se puede mover un movimiento que NO es de seguros.
const DESTINOS_RECLASIF: { v: string; label: string }[] = [
  { v: 'personal', label: '👨‍👩‍👧 Personal' },
  { v: 'turistico_pisos', label: '🏖️ Pisos turísticos' },
  { v: 'turistico_duplex', label: '🏠 Dúplex' },
  { v: 'traspaso_interno', label: '🔁 Traspaso interno' },
]

interface Fila {
  compania: string
  meses: Record<string, number>
  total: number
}

interface MovDetalle {
  id: string
  fecha: string
  concepto: string
  contraparte: string
  banco: string
  importe: number
  confirmado: boolean
  compania: string
  companiaManual: boolean
  motivo: 'nombre' | 'descarte'
}

interface ModalInfo {
  titulo: string
  compania: string
  mes?: string
}

export default function CorreduriaClient() {
  const añoActual = new Date().getFullYear()
  const [año, setAño] = useState(añoActual)
  const [filas, setFilas] = useState<Fila[]>([])
  const [pendiente, setPendiente] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<ModalInfo | null>(null)

  const cargarMatriz = useCallback(() => {
    setLoading(true)
    setError('')
    fetch(`/api/correduria?año=${año}`)
      .then(r => { if (!r.ok) throw new Error('Error al cargar datos'); return r.json() })
      .then(d => { setFilas(d.filas || []); setPendiente(d.pendiente || 0); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [año])

  useEffect(() => { cargarMatriz() }, [cargarMatriz])

  const totalAnual = filas.reduce((s, f) => s + f.total, 0)
  const totalesMes = MESES.map((_, i) => {
    const key = mesKey(año, i)
    return filas.reduce((s, f) => s + (f.meses[key] ?? 0), 0)
  })
  const mejorMesIdx = totalesMes.length ? totalesMes.indexOf(Math.max(...totalesMes)) : 0
  const compañiasActivas = filas.length

  // Estilo común de toda celda clicable con importe.
  const cellBtn: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    font: 'inherit', color: 'inherit', textDecoration: 'underline', textDecorationStyle: 'dotted',
    textDecorationColor: 'var(--border)', textUnderlineOffset: 3,
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        @media (max-width: 768px) {
          .corr-header { flex-direction: column !important; align-items: flex-start !important; }
          .corr-kpis { grid-template-columns: 1fr 1fr !important; }
          .corr-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
        @media (max-width: 480px) {
          .corr-kpis { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header */}
      <div className="corr-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>🛡️ Correduría de seguros</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Liquidaciones de comisiones por compañía aseguradora · Auto-actualizado desde banca
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setAño(a => a - 1)}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', fontSize: 16 }}
          >←</button>
          <span style={{ fontWeight: 700, fontSize: 16, minWidth: 50, textAlign: 'center', color: 'var(--text)' }}>{año}</span>
          <button
            onClick={() => setAño(a => a + 1)}
            disabled={año >= añoActual}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', fontSize: 16, opacity: año >= añoActual ? 0.35 : 1 }}
          >→</button>
        </div>
      </div>

      {/* Cartera en vivo (puerto HTTP a central-asegura) */}
      <CarteraViva />

      {/* KPIs */}
      {!loading && !error && totalAnual > 0 && (
        <div className="corr-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total cobrado', value: eur(totalAnual), color: 'var(--primary)' },
            { label: 'Compañías activas', value: String(compañiasActivas), color: 'var(--text)' },
            { label: 'Mejor mes', value: `${MESES[mejorMesIdx]} (${eur(totalesMes[mejorMesIdx])})`, color: 'var(--text)' },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
            </div>
          ))}
          {/* KPI: pendiente de confirmar (clicable → desglose solo de lo dudoso) */}
          <button
            onClick={() => pendiente > 0 && setModal({ titulo: 'Pendiente de confirmar', compania: '__PENDIENTE__' })}
            style={{ textAlign: 'left', background: pendiente > 0 ? '#fff7ed' : 'var(--surface)', border: `1px solid ${pendiente > 0 ? '#fdba74' : 'var(--border)'}`, borderRadius: 12, padding: '18px 20px', cursor: pendiente > 0 ? 'pointer' : 'default' }}
          >
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Pendiente de confirmar {pendiente > 0 ? '→' : ''}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: pendiente > 0 ? '#ea580c' : 'var(--muted)' }}>{pendiente > 0 ? eur(pendiente) : '✓ Todo revisado'}</div>
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--muted)' }}>Cargando liquidaciones…</div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#dc2626', marginBottom: 24 }}>
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filas.length === 0 && (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🛡️</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin liquidaciones en {año}</div>
          <div style={{ fontSize: 13 }}>Los datos se actualizan automáticamente con los movimientos bancarios clasificados como correduría.</div>
        </div>
      )}

      {/* Matrix table */}
      {!loading && !error && filas.length > 0 && (
        <div className="corr-table-wrap" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,.03)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--text)', position: 'sticky', left: 0, background: 'rgba(248,249,250,1)' }}>
                  Compañía
                </th>
                {MESES.map(m => (
                  <th key={m} style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--muted)', minWidth: 60 }}>{m}</th>
                ))}
                <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text)', borderLeft: '2px solid var(--border)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => {
                const esOtras = f.compania === COMPANIA_OTRAS
                return (
                  <tr key={f.compania} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: esOtras ? '#ea580c' : 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--surface)' }}>
                      {esOtras ? '⚠️ ' : ''}{companiaLabel(f.compania)}
                    </td>
                    {MESES.map((_, i) => {
                      const key = mesKey(año, i)
                      const val = f.meses[key] ?? 0
                      return (
                        <td key={i} style={{ padding: '10px 10px', textAlign: 'right', color: val > 0 ? 'var(--text)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {val > 0
                            ? <button style={cellBtn} onClick={() => setModal({ titulo: `${companiaLabel(f.compania)} · ${MESES[i]} ${año}`, compania: f.compania, mes: key })}>{eur(val)}</button>
                            : '—'}
                        </td>
                      )
                    })}
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)', borderLeft: '2px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>
                      <button style={{ ...cellBtn, fontWeight: 700, color: 'var(--primary)' }} onClick={() => setModal({ titulo: `${companiaLabel(f.compania)} · ${año}`, compania: f.compania })}>{eur(f.total)}</button>
                    </td>
                  </tr>
                )
              })}
              {/* Totals row */}
              <tr style={{ background: 'rgba(0,0,0,.03)', borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', position: 'sticky', left: 0, background: 'rgba(248,249,250,1)' }}>
                  Total
                </td>
                {totalesMes.map((t, i) => (
                  <td key={i} style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: t > 0 ? 'var(--text)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {t > 0
                      ? <button style={{ ...cellBtn, fontWeight: 600 }} onClick={() => setModal({ titulo: `Todas · ${MESES[i]} ${año}`, compania: '__TOTAL__', mes: mesKey(año, i) })}>{eur(t)}</button>
                      : '—'}
                  </td>
                ))}
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)', fontSize: 15, borderLeft: '2px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>
                  <button style={{ ...cellBtn, fontWeight: 800, fontSize: 15, color: 'var(--primary)' }} onClick={() => setModal({ titulo: `Todas · ${año}`, compania: '__TOTAL__' })}>{eur(totalAnual)}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>Datos calculados de los movimientos bancarios con destino «correduría de seguros». Pincha cualquier importe para ver y confirmar su desglose.</span>
        <Link href="/finanzas/fiscal" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Ver resumen financiero →</Link>
      </div>

      {modal && (
        <DesgloseModal
          info={modal}
          año={año}
          onClose={() => setModal(null)}
          onChanged={cargarMatriz}
        />
      )}
    </div>
  )
}

function DesgloseModal({ info, año, onClose, onChanged }: { info: ModalInfo; año: number; onClose: () => void; onChanged: () => void }) {
  const [movs, setMovs] = useState<MovDetalle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [reclasif, setReclasif] = useState<string | null>(null)
  const [picker, setPicker] = useState<string | null>(null)   // id con el selector de compañía abierto
  const [otra, setOtra] = useState('')                          // texto de "Otra…"

  const cargar = useCallback(() => {
    setLoading(true)
    setError('')
    const qs = new URLSearchParams({ año: String(año), compania: info.compania })
    if (info.mes) qs.set('mes', info.mes)
    fetch(`/api/correduria/detalle?${qs.toString()}`)
      .then(r => { if (!r.ok) throw new Error('Error al cargar el desglose'); return r.json() })
      .then(d => { setMovs(d.movimientos || []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [año, info])

  useEffect(() => { cargar() }, [cargar])

  // Confirma que es de seguros y, si se indica, asigna la compañía (override). compania=null →
  // "no lo sé" (se queda en Sin identificar). Tras confirmar, recarga el desglose (el movimiento
  // puede salir de este listado si estaba filtrado por pendiente o por otra compañía) y la matriz.
  async function confirmar(id: string, compania: string | null) {
    setBusy(id)
    await fetch('/api/banca/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, confirmado: true, compania }) })
    setPicker(null)
    setOtra('')
    setBusy(null)
    onChanged()
    cargar()
  }

  async function reclasificar(id: string, destino: string) {
    setBusy(id)
    await fetch('/api/banca/destino', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, destino }) })
    // Sale de seguros → desaparece de la correduría.
    setMovs(prev => prev.filter(m => m.id !== id))
    setReclasif(null)
    setBusy(null)
    onChanged()
  }

  const total = movs.reduce((s, m) => s + m.importe, 0)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 14, maxWidth: 760, width: '100%', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 12px 48px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--surface)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{info.titulo}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{movs.length} movimiento{movs.length === 1 ? '' : 's'} · {eur(total)}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>×</button>
        </div>

        <div style={{ padding: 16 }}>
          {loading && <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>Cargando…</div>}
          {error && <div style={{ color: '#dc2626', padding: 12 }}>{error}</div>}
          {!loading && !error && movs.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>No quedan movimientos en este desglose.</div>
          )}
          {!loading && !error && movs.map(m => {
            const sospechoso = m.motivo === 'descarte' && !m.confirmado
            return (
              <div key={m.id} style={{ border: `1px solid ${sospechoso ? '#fdba74' : 'var(--border)'}`, background: sospechoso ? '#fff7ed' : 'transparent', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{m.concepto || m.contraparte || '(sin concepto)'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                      {fmtFecha(m.fecha)} · {m.banco}{m.contraparte ? ` · ${m.contraparte}` : ''}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 5 }}>
                      {m.motivo === 'nombre'
                        ? <span style={{ color: '#16a34a' }}>✅ Clasificado por nombre de aseguradora</span>
                        : <span style={{ color: '#ea580c' }}>⚠️ Clasificado por descarte ({m.banco}) — revisa que sea de seguros</span>}
                      {m.confirmado && <span style={{ color: '#16a34a', marginLeft: 8 }}>· ✓ Confirmado</span>}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 3, color: 'var(--muted)' }}>
                      Compañía: <strong style={{ color: m.compania === COMPANIA_OTRAS ? '#ea580c' : 'var(--text)' }}>{companiaLabel(m.compania)}</strong>
                      {m.companiaManual && <span style={{ marginLeft: 6 }}>✍️ asignada</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{eur(m.importe)}</div>
                </div>
                {picker === m.id ? (
                  <div style={{ marginTop: 10, padding: 10, border: '1px dashed var(--border)', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>¿De qué compañía es?</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {COMPANIAS_CONOCIDAS.map(c => (
                        <button key={c} disabled={busy === m.id} onClick={() => confirmar(m.id, c)}
                          style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>
                          {c}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input value={otra} onChange={e => setOtra(e.target.value)} placeholder="Otra compañía…"
                        style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, flex: '1 1 160px', minWidth: 0 }} />
                      <button disabled={busy === m.id || !otra.trim()} onClick={() => confirmar(m.id, otra.trim())}
                        style={{ padding: '5px 10px', border: '1px solid #16a34a', borderRadius: 8, background: otra.trim() ? '#16a34a' : 'var(--surface)', color: otra.trim() ? '#fff' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: otra.trim() ? 'pointer' : 'default' }}>
                        Usar
                      </button>
                      <button disabled={busy === m.id} onClick={() => confirmar(m.id, null)}
                        style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>
                        No lo sé
                      </button>
                      <button onClick={() => { setPicker(null); setOtra('') }} style={{ padding: '5px 8px', border: 'none', background: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>cancelar</button>
                    </div>
                  </div>
                ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {!m.confirmado ? (
                    <button disabled={busy === m.id} onClick={() => { setPicker(m.id); setOtra('') }}
                      style={{ padding: '6px 12px', border: '1px solid #16a34a', borderRadius: 8, background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      ✓ Es de seguros · elegir compañía
                    </button>
                  ) : (
                    <button disabled={busy === m.id} onClick={() => { setPicker(m.id); setOtra('') }}
                      style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      ✍️ {m.compania === COMPANIA_OTRAS ? 'Asignar compañía' : 'Cambiar compañía'}
                    </button>
                  )}
                  {reclasif === m.id ? (
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Mover a:</span>
                      {DESTINOS_RECLASIF.map(d => (
                        <button key={d.v} disabled={busy === m.id} onClick={() => reclasificar(m.id, d.v)}
                          style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>
                          {d.label}
                        </button>
                      ))}
                      <button onClick={() => setReclasif(null)} style={{ padding: '5px 8px', border: 'none', background: 'none', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>cancelar</button>
                    </span>
                  ) : (
                    <button disabled={busy === m.id} onClick={() => setReclasif(m.id)}
                      style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      No es de seguros ▾
                    </button>
                  )}
                </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Cartera en vivo ──────────────────────────────────────────────────────────
// Lee /api/correduria/cartera (puerto HTTP a central-asegura). Tres estados:
// «sin conectar» NUNCA se pinta como cartera vacía, y un fallo es visible.

type Cartera =
  | { estado: 'sin_configurar' }
  | { estado: 'error' }
  | {
      estado: 'ok'; nombre: string | null; clientes: number; leads: number
      polizasVigentes: number; polizasPendientesFecha: number; polizasNoVigentes: number
      siniestrosAbiertos: number
    }

const num = (n: number) => n.toLocaleString('es-ES')

function CarteraViva() {
  const [cartera, setCartera] = useState<Cartera | null>(null)

  useEffect(() => {
    fetch('/api/correduria/cartera')
      .then(r => (r.ok ? r.json() : { estado: 'error' }))
      .then(setCartera)
      .catch(() => setCartera({ estado: 'error' }))
  }, [])

  const caja: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px',
    background: 'var(--surface)', marginBottom: 28,
  }

  if (cartera === null) {
    return <div style={{ ...caja, color: 'var(--muted)', fontSize: 13 }}>Cargando cartera…</div>
  }

  if (cartera.estado === 'sin_configurar') {
    return (
      <div style={{ ...caja, borderColor: '#f0c674' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>📁 Cartera en vivo · pendiente de conectar</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Falta el puerto con central-asegura (env <code>ASEGURA_OPERADOR_SECRET</code> en los dos proyectos).
          Esto NO significa que no haya cartera: los datos siguen en su base y se verán aquí al conectar.
        </div>
      </div>
    )
  }

  if (cartera.estado === 'error') {
    return (
      <div style={{ ...caja, borderColor: '#d66' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>📁 Cartera en vivo · sin respuesta</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          El puerto con central-asegura no ha respondido. La cartera NO está vacía: es un fallo de
          conexión — reintenta en un rato o revisa el secreto compartido.
        </div>
      </div>
    )
  }

  const kpis = [
    { label: 'Pólizas en vigor', value: num(cartera.polizasVigentes), color: 'var(--primary)' },
    { label: 'Sin fecha (pendientes)', value: num(cartera.polizasPendientesFecha), color: 'var(--text)' },
    { label: 'Históricas', value: num(cartera.polizasNoVigentes), color: 'var(--muted)' },
    { label: 'Clientes', value: num(cartera.clientes), color: 'var(--text)' },
    { label: 'Leads', value: num(cartera.leads), color: 'var(--muted)' },
    { label: 'Siniestros abiertos', value: num(cartera.siniestrosAbiertos), color: cartera.siniestrosAbiertos > 0 ? '#d66' : 'var(--text)' },
  ]

  return (
    <div style={{ ...caja, padding: '16px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>📁 Cartera en vivo{cartera.nombre ? ` · ${cartera.nombre}` : ''}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          «En vigor» = estado vigente y vencimiento hoy o futuro; las pólizas sin fecha NO se cuentan como vigentes ni vencidas.
        </div>
      </div>
      <div className="corr-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
