'use client'
import { useState } from 'react'
import { eur } from '@/lib/dinero'

export interface Empresa {
  empresa: string
  empresaNorm: string
  provincia: string | null
  score: number
  motivo: string
  cif: string | null
  cnae: string | null
  facturacion: number | null
  enriquecida: boolean
  preconcurso: boolean
}

const chip = (bg: string): React.CSSProperties => ({
  fontSize: 12, padding: '2px 8px', borderRadius: 999, background: bg, color: 'var(--text)', whiteSpace: 'nowrap',
})
const btn = (primary?: boolean): React.CSSProperties => ({
  minHeight: 40, padding: '0 12px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13,
  border: '1px solid var(--border)', background: primary ? 'var(--primary)' : 'var(--surface)', color: primary ? '#fff' : 'var(--text)',
})

interface Ficha {
  ceoEdad: string; consejoEdadMedia: string; descendencia: '' | 'si' | 'no'; preconcurso: boolean; saludNota: string; notas: string
}
const FICHA_VACIA: Ficha = { ceoEdad: '', consejoEdadMedia: '', descendencia: '', preconcurso: false, saludNota: '', notas: '' }

export default function EmpresaCard({ e, onCambio, invitado = false }: { e: Empresa; onCambio: () => void; invitado?: boolean }) {
  const [cif, setCif] = useState(e.cif ?? '')
  const [enriqueciendo, setEnriqueciendo] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [fichaOpen, setFichaOpen] = useState(false)
  const [ficha, setFicha] = useState<Ficha>(FICHA_VACIA)
  const [fichaCargada, setFichaCargada] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [investigando, setInvestigando] = useState(false)
  const [web, setWeb] = useState<string | null>(null)

  async function investigar() {
    if (investigando) return
    setInvestigando(true)
    try {
      const r = await fetch('/api/empresas/investigar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: e.empresa, provincia: e.provincia || undefined }),
      })
      const j = await r.json()
      setWeb(j.ok ? j.text : (j.error || 'Sin resultados.'))
    } catch {
      setWeb('No se pudo buscar.')
    } finally {
      setInvestigando(false)
    }
  }

  async function enriquecer() {
    if (enriqueciendo) return
    setEnriqueciendo(true)
    setMsg(null)
    try {
      const r = await fetch('/api/empresas/enriquecer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaNorm: e.empresaNorm, cif: cif.trim() || undefined }),
      })
      const j = await r.json()
      if (j.ok) { setMsg('Enriquecida ✓'); onCambio() } else setMsg(j.mensaje || 'No se pudo enriquecer.')
    } catch {
      setMsg('Error de red.')
    } finally {
      setEnriqueciendo(false)
    }
  }

  async function abrirFicha() {
    const abrir = !fichaOpen
    setFichaOpen(abrir)
    if (abrir && !fichaCargada) {
      try {
        const r = await fetch(`/api/empresas/ficha?empresaNorm=${encodeURIComponent(e.empresaNorm)}`)
        const j = await r.json()
        const f = j.ficha
        if (f) setFicha({
          ceoEdad: f.ceo_edad?.toString() ?? '', consejoEdadMedia: f.consejo_edad_media?.toString() ?? '',
          descendencia: f.descendencia === true ? 'si' : f.descendencia === false ? 'no' : '',
          preconcurso: Boolean(f.preconcurso), saludNota: f.salud_nota ?? '', notas: f.notas ?? '',
        })
      } catch { /* deja la ficha vacía */ }
      setFichaCargada(true)
    }
  }

  async function guardarFicha() {
    setGuardando(true)
    try {
      await fetch('/api/empresas/ficha', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaNorm: e.empresaNorm,
          ceoEdad: ficha.ceoEdad ? Number(ficha.ceoEdad) : undefined,
          consejoEdadMedia: ficha.consejoEdadMedia ? Number(ficha.consejoEdadMedia) : undefined,
          descendencia: ficha.descendencia === '' ? undefined : ficha.descendencia === 'si',
          preconcurso: ficha.preconcurso,
          saludNota: ficha.saludNota || undefined,
          notas: ficha.notas || undefined,
        }),
      })
      setFichaOpen(false)
      onCambio()
    } catch { /* ignore */ } finally { setGuardando(false) }
  }

  const inp: React.CSSProperties = { minHeight: 40, padding: '0 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', width: '100%' }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{e.empresa}</strong>
        <span style={{ fontWeight: 700, color: e.score >= 70 ? 'var(--primary)' : 'var(--muted)' }}>{e.score}/100</span>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>{e.provincia ?? '—'} · {e.motivo}</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {e.enriquecida && <span style={chip('var(--primary-light)')}>enriquecida</span>}
        {e.cnae && <span style={chip('var(--bg)')}>CNAE {e.cnae}</span>}
        {typeof e.facturacion === 'number' && <span style={chip('var(--bg)')}>{eur(e.facturacion)}</span>}
        {e.preconcurso && <span style={chip('var(--warning-bg, #fef3c7)')}>preconcurso</span>}
        {e.cif && <span style={chip('var(--bg)')}>{e.cif}</span>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
        {!invitado && !e.cif && (
          <input value={cif} onChange={(ev) => setCif(ev.target.value)} placeholder="CIF (para enriquecer)"
            style={{ ...inp, width: 160 }} />
        )}
        {!invitado && (
          <button onClick={enriquecer} disabled={enriqueciendo} style={btn(false)}>
            {enriqueciendo ? 'Enriqueciendo…' : e.enriquecida ? '↻ Re-enriquecer' : '💰 Enriquecer'}
          </button>
        )}
        <button onClick={abrirFicha} style={btn(false)}>{fichaOpen ? 'Cerrar ficha' : '📝 Ficha'}</button>
        <button onClick={investigar} disabled={investigando} style={btn(false)}>
          {investigando ? 'Buscando…' : '🔎 Investigar (web)'}
        </button>
        {msg && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{msg}</span>}
      </div>

      {web && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>🔎 Investigación web (fuentes públicas — verifica):</div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{web}</div>
        </div>
      )}

      {fichaOpen && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Ficha cualitativa (manual — lo que ninguna API da)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Edad CEO
              <input type="number" value={ficha.ceoEdad} onChange={(ev) => setFicha({ ...ficha, ceoEdad: ev.target.value })} style={inp} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Edad media consejo
              <input type="number" value={ficha.consejoEdadMedia} onChange={(ev) => setFicha({ ...ficha, consejoEdadMedia: ev.target.value })} style={inp} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Descendencia/relevo
              <select value={ficha.descendencia} onChange={(ev) => setFicha({ ...ficha, descendencia: ev.target.value as Ficha['descendencia'] })} style={inp}>
                <option value="">—</option><option value="si">Sí</option><option value="no">No</option>
              </select>
            </label>
          </div>
          <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={ficha.preconcurso} onChange={(ev) => setFicha({ ...ficha, preconcurso: ev.target.checked })} />
            Preconcurso (comunicación art. 5 bis)
          </label>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Salud (administrador/socio)
            <input value={ficha.saludNota} onChange={(ev) => setFicha({ ...ficha, saludNota: ev.target.value })} placeholder="p.ej. socio mayoritario enfermo" style={inp} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Notas
            <textarea value={ficha.notas} onChange={(ev) => setFicha({ ...ficha, notas: ev.target.value })} rows={2}
              style={{ ...inp, minHeight: 56, padding: 10, resize: 'vertical' }} />
          </label>
          <div>
            <button onClick={guardarFicha} disabled={guardando} style={btn(true)}>{guardando ? 'Guardando…' : 'Guardar ficha'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
