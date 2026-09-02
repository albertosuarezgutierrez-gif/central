'use client'
import { useState, useEffect, useCallback } from 'react'
import { describirCausaAsegura } from '@/lib/correduria-puerto'
import Link from 'next/link'
import { Shield } from 'lucide-react'
import { PageHeader, BtnLink } from '@/components/ui'
import { companiaLabel, COMPANIA_OTRAS, COMPANIAS_CONOCIDAS } from '@/lib/correduria'
import { eur } from '@/lib/dinero'
import CuadreComisiones from './CuadreComisiones'
import BuscadorCartera from './BuscadorCartera'
import Retencion from './Retencion'
import Duplicadas from './Duplicadas'

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

export default function CorreduriaClient({ urlAsegura }: { urlAsegura: string }) {
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

      {/* Header */}
      <PageHeader
        titulo="Correduría"
        icono={<Shield size={20} strokeWidth={1.75} />}
        acciones={<BtnLink href="/correduria/hogar" variante="secundario">🏠 Presupuesto de hogar</BtnLink>}
      />

      {/* ── 1. BUSCAR ──────────────────────────────────────────────────────
          Lo primero, y HERMANO de la cartera, nunca hijo: `CarteraViva` hace
          `return` temprano cuando el puerto falla, así que anidado aquí dentro
          el buscador desaparecía justo el día que asegura no responde. */}
      <div style={{ marginBottom: 20 }}>
        <BuscadorCartera />
        {/* Alta manual: quien no está en la cartera (el buscador también lo ofrece al no encontrar). */}
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <BtnLink href="/correduria/cliente/nuevo" variante="secundario">➕ Nuevo cliente</BtnLink>
        </div>
      </div>

      {/* ── 2. LA CARTERA DE UN VISTAZO ─────────────────────────────────── */}
      <CarteraViva />

      {/* Pólizas duplicadas en la cartera viva (guardián Codeoscopic↔CIMA, §5).
          FUERA de `CarteraViva`, por la misma regla que el buscador: ese bloque
          hace `return` temprano cuando el puerto falla y se llevaría el aviso. */}
      <Duplicadas />

      {/* ── 3. A QUIÉN LLAMAR HOY ───────────────────────────────────────────
          Recibos devueltos y vencidos sin cobrar, por urgencia REAL. Es la
          pantalla comercial: lo único de aquí que se hace con el teléfono en
          la mano. Va antes que el dinero ya cobrado a propósito. */}
      <div style={{ marginBottom: 20 }}>
        <Retencion urlAsegura={urlAsegura} />
      </div>

      {/* ── 4. ¿ME PAGAN LO QUE ME DEBEN? ──────────────────────────────────
          Cuadre devengado → liquidado → cobrado. Va ANTES de la matriz de
          banco porque la matriz solo ve el ingreso (la remesa) y la cifra que
          va a la renta es el bruto. */}
      <CuadreComisiones año={año} />

      {/* ⚠️ Pendiente de confirmar: banda, no tarjeta, y FUERA del gate
          `totalAnual > 0` que la escondía un año sin ingreso bancario — que es
          justo cuando más importa que haya movimientos dudosos sin revisar. */}
      {!loading && !error && pendiente > 0 && (
        <button
          onClick={() => setModal({ titulo: 'Pendiente de confirmar', compania: '__PENDIENTE__' })}
          style={{ width: '100%', textAlign: 'left', background: 'var(--warning-bg)', border: '1px solid #fdba74', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', marginBottom: 20, minHeight: 44 }}
        >
          <span style={{ fontSize: 13, color: '#9a3412' }}>
            ⚠️ <strong>{eur(pendiente)}</strong> en movimientos de seguros sin confirmar a qué
            compañía son → revisar
          </span>
        </button>
      )}

      {/* ── 5. EL DETALLE DEL BANCO ────────────────────────────────────────
          Cerrado por defecto y con montaje perezoso: es auditoría fina, no la
          foto que se mira cada día. Se abre solo si hay algo sin confirmar.
          🚨 No se borra: el modal de desglose es el ÚNICO camino para
          reclasificar un movimiento y para que aprendan `correduria_reglas` y
          `banca_destino_reglas`. */}
      <details open={pendiente > 0} style={{ marginBottom: 20 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14, padding: '10px 0', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
          📊 Detalle del banco · {año}
          <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)' }}>
            {loading ? 'cargando…' : `${eur(totalAnual)} cobrado · ${compañiasActivas} compañía(s)`}
          </span>
        </summary>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0 14px' }}>
          <button
            onClick={() => setAño(a => a - 1)}
            aria-label="Año anterior"
            style={{ minHeight: 44, minWidth: 44, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', fontSize: 16 }}
          >←</button>
          <span style={{ fontWeight: 700, fontSize: 16, minWidth: 50, textAlign: 'center', color: 'var(--text)' }}>{año}</span>
          <button
            onClick={() => setAño(a => a + 1)}
            disabled={año >= añoActual}
            aria-label="Año siguiente"
            style={{ minHeight: 44, minWidth: 44, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', fontSize: 16, opacity: año >= añoActual ? 0.35 : 1 }}
          >→</button>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            El año gobierna solo este bloque y el cuadre — no la cartera viva.
          </span>
        </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--muted)' }}>Cargando liquidaciones…</div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: 'var(--negative-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: 'var(--negative)', marginBottom: 24 }}>
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
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: esOtras ? 'var(--warning)' : 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--surface)' }}>
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

      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
        Salen de los movimientos bancarios con destino «correduría de seguros». Pincha cualquier
        importe para ver y confirmar su desglose.
      </div>
      </details>

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
          {error && <div style={{ color: 'var(--negative)', padding: 12 }}>{error}</div>}
          {!loading && !error && movs.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>No quedan movimientos en este desglose.</div>
          )}
          {!loading && !error && movs.map(m => {
            const sospechoso = m.motivo === 'descarte' && !m.confirmado
            return (
              <div key={m.id} style={{ border: `1px solid ${sospechoso ? '#fdba74' : 'var(--border)'}`, background: sospechoso ? 'var(--warning-bg)' : 'transparent', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{m.concepto || m.contraparte || '(sin concepto)'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                      {fmtFecha(m.fecha)} · {m.banco}{m.contraparte ? ` · ${m.contraparte}` : ''}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 5 }}>
                      {m.motivo === 'nombre'
                        ? <span style={{ color: 'var(--positive)' }}>✅ Clasificado por nombre de aseguradora</span>
                        : <span style={{ color: 'var(--warning)' }}>⚠️ Clasificado por descarte ({m.banco}) — revisa que sea de seguros</span>}
                      {m.confirmado && <span style={{ color: 'var(--positive)', marginLeft: 8 }}>· ✓ Confirmado</span>}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 3, color: 'var(--muted)' }}>
                      Compañía: <strong style={{ color: m.compania === COMPANIA_OTRAS ? 'var(--warning)' : 'var(--text)' }}>{companiaLabel(m.compania)}</strong>
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
                        style={{ padding: '5px 10px', border: '1px solid var(--positive)', borderRadius: 8, background: otra.trim() ? 'var(--positive)' : 'var(--surface)', color: otra.trim() ? '#fff' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: otra.trim() ? 'pointer' : 'default' }}>
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
                      style={{ padding: '6px 12px', border: '1px solid var(--positive)', borderRadius: 8, background: 'var(--positive)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
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

type MotivoError = 'secreto_rechazado' | 'asegura_error' | 'respuesta_ilegible' | 'red'

// Cada motivo se arregla en un sitio distinto — el recuadro lo dice para no
// tener que adivinar entre secreto, BD de asegura o red (31/08/2026).
const MOTIVOS: Record<MotivoError, string> = {
  secreto_rechazado:
    'central-asegura ha RECHAZADO el secreto (401): los dos valores de ASEGURA_OPERADOR_SECRET no coinciden. Vuelve a pegar el MISMO valor en los dos proyectos de Vercel y redespliega.',
  asegura_error:
    'central-asegura responde, pero no puede leer la cartera en central: revisa DATABASE_URL del proyecto Vercel central-asegura (rol prisma_seguros) y su último despliegue.',
  respuesta_ilegible:
    'central-asegura ha devuelto una respuesta inesperada (ni cartera ni error conocido). Mira los logs del proyecto en Vercel.',
  red: 'no se pudo contactar con central-asegura (timeout o red). Reintenta en un rato.',
}

type Cartera =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo?: MotivoError; causa?: string }
  | {
      estado: 'ok'; nombre: string | null; clientes: number; leads: number
      polizasVigentes: number; polizasPendientesFecha: number; polizasNoVigentes: number
      siniestrosAbiertos: number
      // null = el puerto no informa vencimientos todavía. «—», nunca 0.
      vence30?: number | null; vence60?: number | null
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
          La cartera NO está vacía — el puerto con central-asegura ha fallado:{' '}
          {MOTIVOS[cartera.motivo ?? 'respuesta_ilegible']}
          {describirCausaAsegura(cartera.causa) && (
            <> <strong>Causa que declara asegura:</strong> {describirCausaAsegura(cartera.causa)}.</>
          )}
        </div>
      </div>
    )
  }

  // Vencimientos: `null` significa «el puerto todavía no lo informa» y se pinta
  // «—» con su nota. Un 0 aquí diría «no vence nada», que es otra cosa.
  const vence = (n: number | null | undefined) => (typeof n === 'number' ? num(n) : '—')

  // 🚨 De ocho KPIs a TRES. Los que se van no eran datos de menos: eran
  // aritmética mental. «Vencen en 60» no dispara ninguna acción distinta de
  // «vencen en 30» (la ventana que manda es la del preaviso, LCS art. 22);
  // «Históricas» y «Leads» son el MISMO volcado de 2013-2018 contado en dos
  // unidades y nunca cambian; y «Sin fecha» no es un KPI sino una advertencia
  // sobre la calidad del dato, así que baja a subtítulo del que sí lo es.
  const kpis = [
    {
      label: 'Vencen en 30 días',
      value: vence(cartera.vence30),
      sub: 'la ventana de la LCS art. 22',
      color: (cartera.vence30 ?? 0) > 0 ? '#c96' : 'var(--muted)',
    },
    {
      label: 'Cartera viva',
      value: `${num(cartera.polizasVigentes)} pólizas`,
      // El «sin fecha» va AQUÍ y no como tarjeta propia: es el tercer estado
      // de este mismo número («vigente pero no se sabe cuándo vence»), no una
      // magnitud aparte.
      sub:
        `${num(cartera.clientes)} clientes` +
        (cartera.polizasPendientesFecha > 0
          ? ` · ${num(cartera.polizasPendientesFecha)} sin fecha de vencimiento informada`
          : ''),
      color: 'var(--primary)',
    },
    {
      label: 'Siniestros abiertos',
      value: num(cartera.siniestrosAbiertos),
      sub: cartera.siniestrosAbiertos > 0 ? 'en tramitación' : 'ninguno abierto',
      color: cartera.siniestrosAbiertos > 0 ? '#d66' : 'var(--text)',
    },
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
            {k.sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{k.sub}</div>}
          </div>
        ))}
      </div>
      {/* El volcado histórico: una línea, no dos tarjetas. Son 28.729 pólizas
          de 2013-2018 que no cambian nunca y competían con los 109 números que
          sí deciden algo. */}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
        Además hay {num(cartera.polizasNoVigentes)} póliza(s) del volcado histórico y{' '}
        {num(cartera.leads)} lead(s): vencimientos de 2013-2018, sin actividad. Se buscan igual,
        pero no generan avisos.
      </div>
      {cartera.vence30 === null && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
          Los vencimientos aún no llegan por el puerto (central-asegura pendiente de desplegar con esta versión).
          «—» significa que no se sabe, no que no venza nada.
        </div>
      )}
      <Vencimientos />
    </div>
  )
}

// ── Renovaciones ────────────────────────────────────────────────────────────
// Las pólizas que vencen son la máquina comercial de una correduría. El orden
// lo marca la LCS art. 22: dentro del mes de preaviso el tomador ya no puede
// oponerse a la prórroga, así que «quedan 9 días» y «quedan 70» son trabajos
// distintos y la lista lo dice.

const URGENCIAS: Record<string, { label: string; color: string; icono: string }> = {
  vencida: { label: 'Vencida', color: '#d66', icono: '🔴' },
  prorroga_inevitable: { label: 'Se prorroga (fuera de plazo)', color: '#c96', icono: '🟠' },
  ultima_llamada: { label: 'Última llamada', color: '#c96', icono: '🟡' },
  a_tiempo: { label: 'A tiempo', color: 'var(--muted)', icono: '🟢' },
}

const TIPOS: Record<string, string> = {
  auto: '🚗 Auto', moto: '🏍️ Moto', hogar: '🏠 Hogar', vida: '🧬 Vida', salud: '🩺 Salud',
  decesos: '⚱️ Decesos', responsabilidad_civil: '⚖️ R. Civil', comercio: '🏪 Comercio',
  comunidad: '🏢 Comunidad', accidentes: '🩹 Accidentes',
}

type ObjetoAsegurado = {
  estado: 'conocido' | 'no_informado' | 'cifrado' | 'sin_objeto'
  titulo: string | null; detalle: string | null; nota: string | null
}

type Vencimiento = {
  id: string
  /** `null` = la versión desplegada de asegura aún no manda el id del tomador.
   *  Entonces el nombre NO es un enlace y se dice por qué, en vez de romper. */
  clienteId: string | null
  cliente: string; tipo: string; aseguradora: string
  numeroPoliza: string | null; fechaVencimiento: string; dias: number
  urgencia: string; prima: number | null; fraccionamiento: string | null
  objeto: ObjetoAsegurado | null
}

/**
 * Qué asegura la póliza. Sin esto, «Auto · Mapfre · 431,85€» no dice CUÁL de
 * los tres coches del cliente es, y la llamada empieza preguntando.
 *
 * Cinco casos, y ninguno se pinta como los demás — un hueco vacío diría «no hay
 * nada que asegurar», que es justo lo contrario de lo que se sabe:
 *   objeto null → el puerto (central-asegura) aún no manda el campo.
 *   no_informado → la compañía no lo ha mandado: está pendiente de reclamar.
 *   cifrado      → el dato existe pero llega cifrado y aquí no hay clave.
 *   sin_objeto   → seguro de personas: no hay bien. Ausencia definitiva.
 */
function CeldaObjeto({ objeto }: { objeto: ObjetoAsegurado | null }) {
  if (objeto === null) {
    return (
      <span
        style={{ color: 'var(--muted)' }}
        title="La versión desplegada de central-asegura todavía no informa qué asegura cada póliza. No es que no se sepa: es que aún no llega por el puerto."
      >—</span>
    )
  }
  if (objeto.estado === 'no_informado' || (objeto.titulo === null && objeto.detalle === null)) {
    return (
      <span style={{ color: 'var(--muted)', fontStyle: 'italic' }} title={objeto.nota ?? undefined}>
        {objeto.estado === 'cifrado' ? '🔒 dato cifrado' : 'sin informar'}
      </span>
    )
  }
  return (
    <span title={objeto.nota ?? undefined}>
      <span style={{ color: objeto.estado === 'sin_objeto' ? 'var(--muted)' : 'var(--text)' }}>
        {objeto.titulo}
      </span>
      {objeto.detalle && (
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{objeto.detalle}</div>
      )}
    </span>
  )
}

type RespVencimientos =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo?: MotivoError; causa?: string }
  | { estado: 'ok'; dias: number; polizas: Vencimiento[] }

function Vencimientos() {
  const [datos, setDatos] = useState<RespVencimientos | null>(null)

  useEffect(() => {
    fetch('/api/correduria/vencimientos?dias=90')
      .then(r => (r.ok ? r.json() : { estado: 'error' }))
      .then(setDatos)
      .catch(() => setDatos({ estado: 'error' }))
  }, [])

  if (datos === null || datos.estado === 'sin_configurar') return null

  if (datos.estado === 'error') {
    return (
      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
        📅 <strong>Renovaciones:</strong> no se han podido leer —{' '}
        {MOTIVOS[datos.motivo ?? 'respuesta_ilegible']}
        {describirCausaAsegura(datos.causa) ? ` Causa que declara asegura: ${describirCausaAsegura(datos.causa)}.` : ''} No hay que entenderlo como «no vence nada».
      </div>
    )
  }

  // Primas conocidas y desconocidas, separadas: la compañía no siempre informa
  // la prima (medido con Allianz por EIAC) y un total a secas la daría por 0.
  const conPrima = datos.polizas.filter(p => p.prima !== null)
  const total = conPrima.reduce((s, p) => s + (p.prima ?? 0), 0)
  const sinPrima = datos.polizas.length - conPrima.length

  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>📅 Renovaciones · próximos {datos.dias} días</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {datos.polizas.length === 0
            ? 'Ninguna póliza vigente vence en la ventana.'
            : <>Cartera en juego: {eur(total)}{sinPrima > 0 && ` · ${sinPrima} sin prima informada`}</>}
        </div>
      </div>

      {datos.polizas.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Vence</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Cliente</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Ramo</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Qué asegura</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Compañía</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Prima</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {datos.polizas.map(p => {
                const u = URGENCIAS[p.urgencia] ?? URGENCIAS.a_tiempo
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      {fmtFecha(p.fechaVencimiento)}
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {p.dias === 0 ? 'hoy' : `en ${p.dias} días`}
                      </div>
                    </td>
                    <td style={{ padding: '8px' }}>
                      {/* El acceso directo: un clic y está la ficha entera del
                          cliente (pólizas, recibos, siniestros). Sin volver a
                          buscarlo por su nombre, que es lo que había antes. */}
                      {p.clienteId ? (
                        <Link href={`/correduria/cliente/${p.clienteId}`} style={{ fontWeight: 600 }}>
                          {p.cliente}
                        </Link>
                      ) : (
                        <span title="La versión desplegada de asegura todavía no manda el id del cliente, así que no se puede enlazar su ficha">
                          {p.cliente}
                        </span>
                      )}
                      {p.numeroPoliza && (
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>nº {p.numeroPoliza}</div>
                      )}
                    </td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{TIPOS[p.tipo] ?? p.tipo}</td>
                    <td style={{ padding: '8px', minWidth: 150 }}><CeldaObjeto objeto={p.objeto} /></td>
                    <td style={{ padding: '8px' }}>{p.aseguradora}</td>
                    <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {p.prima === null
                        ? <span style={{ color: 'var(--muted)' }} title="La compañía no informa la prima">sin dato</span>
                        : eur(p.prima)}
                    </td>
                    <td style={{ padding: '8px', color: u.color, whiteSpace: 'nowrap' }}>
                      {u.icono} {u.label}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
        El tomador puede oponerse a la prórroga hasta un mes antes del vencimiento (LCS art. 22): pasada esa
        fecha la póliza se renueva sola. Las pólizas sin fecha de vencimiento no salen aquí — no es que no
        venzan, es que la compañía no ha informado la fecha.
      </div>
    </div>
  )
}
