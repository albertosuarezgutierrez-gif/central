'use client'
import { useEffect, useState, useCallback } from 'react'
import { Pagina } from '@/components/ui'

type Sugerencia = {
  id: string
  rol: string
  nombre_usuario: string
  categoria: string
  texto: string
  leida: boolean
  estado: string
  nota_admin: string | null
  created_at: string
  restaurantes: { nombre: string; ciudad: string } | null
}

const CATEGORIAS = ['', 'bug', 'mejora', 'nueva_funcionalidad', 'otro']
const ESTADOS_FILTER = ['', 'pendiente', 'en_progreso', 'descartado', 'completado']

const estadoColor: Record<string, string> = {
  pendiente: 'var(--warning)',
  en_progreso: 'var(--info)',
  descartado: 'var(--muted)',
  completado: 'var(--positive)',
}

function fecha(s: string) {
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
}

export default function SugerenciasClient() {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [soloNoLeidas, setSoloNoLeidas] = useState(false)
  const [selected, setSelected] = useState<Sugerencia | null>(null)
  const [nota, setNota] = useState('')
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(() => {
    setLoading(true); setError('')
    const p = new URLSearchParams()
    if (filtroCat) p.set('categoria', filtroCat)
    if (filtroEstado) p.set('estado', filtroEstado)
    if (soloNoLeidas) p.set('no_leidas', '1')
    const qs = p.toString() ? `?${p.toString()}` : ''
    fetch(`/api/admin/iarest/sugerencias${qs}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setSugerencias(d.sugerencias ?? []))
      .catch(e => setError(`Error (${e})`))
      .finally(() => setLoading(false))
  }, [filtroCat, filtroEstado, soloNoLeidas])

  useEffect(() => { cargar() }, [cargar])

  async function patch(id: string, updates: Record<string, unknown>) {
    setBusy(true)
    const r = await fetch('/api/admin/iarest/sugerencias', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    if (r.ok) {
      setSugerencias(ss => ss.map(s => s.id === id ? { ...s, ...updates } : s))
      if (selected?.id === id) setSelected(s => s ? { ...s, ...updates } as Sugerencia : s)
    }
    setBusy(false)
  }

  function abrirSugerencia(s: Sugerencia) {
    setSelected(s)
    setNota(s.nota_admin || '')
    if (!s.leida) patch(s.id, { leida: true })
  }

  return (
    <Pagina ancho="lectura">
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '20px' }}>💡 Sugerencias · ia-rest</h1>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={filtroCat}
          onChange={e => setFiltroCat(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }}
        >
          {CATEGORIAS.map(c => <option key={c} value={c}>{c || 'Todas las categorías'}</option>)}
        </select>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }}
        >
          {ESTADOS_FILTER.map(e => <option key={e} value={e}>{e || 'Todos los estados'}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
          <input type="checkbox" checked={soloNoLeidas} onChange={e => setSoloNoLeidas(e.target.checked)} />
          Solo no leídas
        </label>
      </div>

      {loading && <p style={{ color: 'var(--muted)' }}>Cargando…</p>}
      {error && <p style={{ color: '#e53' }}>{error}</p>}

      <div className="suger-layout" style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: '16px', marginTop: '16px' }}>
        <div>
          {sugerencias.length === 0 && !loading && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '48px' }}>Sin sugerencias.</p>
          )}
          {sugerencias.map(s => (
            <div
              key={s.id}
              onClick={() => abrirSugerencia(s)}
              style={{
                background: 'var(--surface)', border: `1px solid ${selected?.id === s.id ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '8px',
                cursor: 'pointer', opacity: s.leida ? 0.7 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    {!s.leida && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', display: 'inline-block', flexShrink: 0 }} />}
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{s.texto.slice(0, 80)}{s.texto.length > 80 ? '…' : ''}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    {s.restaurantes?.nombre || '—'} · {s.nombre_usuario} ({s.rol}) · {fecha(s.created_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                  <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', background: 'var(--border)', color: 'var(--muted)' }}>{s.categoria}</span>
                  {s.estado && (
                    <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', background: (estadoColor[s.estado] || '#888') + '20', color: estadoColor[s.estado] || '#888' }}>
                      {s.estado}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div className="suger-panel" style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '20px', alignSelf: 'start',
          }}>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '2px' }}>{selected.categoria} · {fecha(selected.created_at)}</div>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', lineHeight: 1.4 }}>{selected.texto}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {selected.restaurantes?.nombre}, {selected.restaurantes?.ciudad} · {selected.nombre_usuario} ({selected.rol})
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--muted)' }}>ESTADO</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {ESTADOS_FILTER.filter(Boolean).map(e => (
                  <button
                    key={e}
                    disabled={busy}
                    onClick={() => patch(selected.id, { estado: e })}
                    style={{
                      padding: '3px 9px', borderRadius: '10px', fontSize: '12px', cursor: 'pointer',
                      border: `1px solid ${estadoColor[e] || 'var(--border)'}`,
                      background: selected.estado === e ? (estadoColor[e] + '20') : 'transparent',
                      color: estadoColor[e] || 'var(--text)',
                      fontWeight: selected.estado === e ? 700 : 400,
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--muted)' }}>NOTA INTERNA</div>
              <textarea
                value={nota}
                onChange={e => setNota(e.target.value)}
                placeholder="Notas para recordar…"
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px', fontSize: '13px',
                  border: '1px solid var(--border)', borderRadius: '6px',
                  background: 'transparent', color: 'var(--text)', resize: 'vertical',
                }}
              />
              <button
                disabled={busy}
                onClick={() => patch(selected.id, { nota_admin: nota })}
                style={{
                  marginTop: '6px', padding: '6px 14px', borderRadius: '6px', fontSize: '13px',
                  background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                Guardar nota
              </button>
            </div>
          </div>
        )}
      </div>
    </Pagina>
  )
}
