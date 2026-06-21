'use client'
import { useState, useEffect } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', red: '#dc2626', redBg: '#fef2f2',
  warn: '#d97706', warnBg: '#fffbeb',
}

const TIPOS_RECARGO = [
  { id: 'fijo', label: 'Importe fijo (€)' },
  { id: 'porcentaje', label: 'Porcentaje (%)' },
]

export default function CotizadorConfigPage() {
  const [config, setConfig]     = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [tab, setTab]           = useState<'servicios'|'estancias'|'frecuencias'|'recargos'|'textos'>('servicios')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const r = await fetch('/api/admin/cotizador-config')
    const d = await r.json()
    if (d.config) setConfig(d.config)
    setLoading(false)
  }

  async function guardar() {
    setSaving(true)
    await fetch('/api/admin/cotizador-config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setSaved(true); setTimeout(() => setSaved(false), 2500)
    setSaving(false)
  }

  // ── Helpers servicios ─────────────────────────────────────────────
  function updateServicio(idx: number, key: string, val: any) {
    const arr = [...config.servicios]
    arr[idx] = { ...arr[idx], [key]: val }
    setConfig((c: any) => ({ ...c, servicios: arr }))
  }
  function addServicio() {
    setConfig((c: any) => ({ ...c, servicios: [...c.servicios, { id: `s${Date.now()}`, label: 'Nuevo servicio', base: 30, por_m2: 0.10, activo: true }] }))
  }
  function removeServicio(idx: number) {
    setConfig((c: any) => ({ ...c, servicios: c.servicios.filter((_: any, i: number) => i !== idx) }))
  }

  // ── Helpers estancias ─────────────────────────────────────────────
  function updateEstancia(key: string, field: string, val: any) {
    setConfig((c: any) => ({ ...c, incrementos: { ...c.incrementos, [key]: { ...c.incrementos[key], [field]: val } } }))
  }
  function addEstancia() {
    const key = `estancia_${Date.now()}`
    setConfig((c: any) => ({ ...c, incrementos: { ...c.incrementos, [key]: { label: 'Nueva estancia', precio: 5, activo: true } } }))
  }
  function removeEstancia(key: string) {
    const inc = { ...config.incrementos }
    delete inc[key]
    setConfig((c: any) => ({ ...c, incrementos: inc }))
  }

  // ── Helpers frecuencias ───────────────────────────────────────────
  function updateFrecuencia(idx: number, key: string, val: any) {
    const arr = [...config.frecuencias]
    arr[idx] = { ...arr[idx], [key]: val }
    setConfig((c: any) => ({ ...c, frecuencias: arr }))
  }
  function addFrecuencia() {
    setConfig((c: any) => ({ ...c, frecuencias: [...c.frecuencias, { id: `f${Date.now()}`, label: 'Nueva frecuencia', mult: 1.0, activo: true }] }))
  }

  // ── Helpers recargos ──────────────────────────────────────────────
  function updateRecargo(idx: number, key: string, val: any) {
    const arr = [...config.recargos]
    arr[idx] = { ...arr[idx], [key]: val }
    setConfig((c: any) => ({ ...c, recargos: arr }))
  }
  function addRecargo() {
    setConfig((c: any) => ({ ...c, recargos: [...c.recargos, { id: `r${Date.now()}`, label: 'Nuevo recargo', valor: 10, tipo: 'fijo', activo: true }] }))
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: "'Nunito', sans-serif" }}>Cargando...</div>

  const TABS = [
    { id: 'servicios',   label: '🧹 Servicios' },
    { id: 'estancias',   label: '🚪 Estancias' },
    { id: 'frecuencias', label: '📅 Frecuencias' },
    { id: 'recargos',    label: '➕ Recargos' },
    { id: 'textos',      label: '✏️ Textos' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Nunito', sans-serif" }}>
      {/* Header */}
      <header style={{ background: C.primary, padding: '18px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
          <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none' }}>← Dashboard</a>
          <div style={{ flex: 1 }}>
            <h1 style={{ color: 'white', fontWeight: 800, fontSize: 20, margin: 0 }}>Configurar cotizador</h1>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: 0 }}>Todo lo que cambies aquí se refleja en el cotizador público al instante</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <a href="/cotizador" target="_blank"
              style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              👁 Ver cotizador →
            </a>
            <button onClick={guardar} disabled={saving}
              style={{ background: saved ? '#22c55e' : 'white', color: saved ? 'white' : C.primary, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
              {saving ? 'Guardando...' : saved ? '✅ Guardado' : '💾 Guardar'}
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: tab === t.id ? 'rgba(255,255,255,0.2)' : 'transparent', color: tab === t.id ? 'white' : 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: tab === t.id ? 700 : 500, fontFamily: 'inherit' }}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>

        {/* ── SERVICIOS ── */}
        {tab === 'servicios' && (
          <div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Define los tipos de limpieza que ofreces y su precio base. El precio final = base + m² × precio/m².</div>
            {config.servicios?.map((s: any, i: number) => (
              <div key={i} style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '16px', marginBottom: 10, opacity: s.activo ? 1 : 0.5 }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
                  <input value={s.label} onChange={e => updateServicio(i, 'label', e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }} />
                  <button onClick={() => updateServicio(i, 'activo', !s.activo)}
                    style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: s.activo ? C.okBg : C.bg, color: s.activo ? C.ok : C.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {s.activo ? 'Activo' : 'Inactivo'}
                  </button>
                  <button onClick={() => removeServicio(i)}
                    style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: C.redBg, color: C.red, fontSize: 14, cursor: 'pointer' }}>🗑</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>PRECIO BASE (€)</label>
                    <input type="number" value={s.base} onChange={e => updateServicio(i, 'base', Number(e.target.value))}
                      style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 14, fontWeight: 800, color: C.primary, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>€ POR M²</label>
                    <input type="number" step="0.01" value={s.por_m2} onChange={e => updateServicio(i, 'por_m2', Number(e.target.value))}
                      style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addServicio}
              style={{ width: '100%', padding: '12px', background: C.light, border: `2px dashed ${C.brand}`, borderRadius: 10, fontSize: 13, fontWeight: 700, color: C.primary, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Añadir tipo de servicio
            </button>
          </div>
        )}

        {/* ── ESTANCIAS ── */}
        {tab === 'estancias' && (
          <div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Precio adicional por cada estancia. El cliente indica cuántas tiene y el precio sube automáticamente.</div>
            {config.incrementos && Object.entries(config.incrementos).map(([key, incr]: any) => (
              <div key={key} style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, opacity: incr.activo ? 1 : 0.5 }}>
                <input value={incr.label} onChange={e => updateEstancia(key, 'label', e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>+</span>
                  <input type="number" step="0.5" value={incr.precio} onChange={e => updateEstancia(key, 'precio', Number(e.target.value))}
                    style={{ width: 70, padding: '8px 8px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 14, fontWeight: 800, color: C.primary, fontFamily: 'inherit', textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: C.muted }}>€</span>
                </div>
                <button onClick={() => updateEstancia(key, 'activo', !incr.activo)}
                  style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: incr.activo ? C.okBg : C.bg, color: incr.activo ? C.ok : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {incr.activo ? '✓' : '○'}
                </button>
                <button onClick={() => removeEstancia(key)}
                  style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: C.redBg, color: C.red, fontSize: 14, cursor: 'pointer' }}>🗑</button>
              </div>
            ))}
            <button onClick={addEstancia}
              style={{ width: '100%', padding: '12px', background: C.light, border: `2px dashed ${C.brand}`, borderRadius: 10, fontSize: 13, fontWeight: 700, color: C.primary, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Añadir estancia
            </button>
          </div>
        )}

        {/* ── FRECUENCIAS ── */}
        {tab === 'frecuencias' && (
          <div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Multiplicador sobre el precio base según la frecuencia del servicio. 1.0 = sin cambio, 1.2 = +20%.</div>
            {config.frecuencias?.map((f: any, i: number) => (
              <div key={i} style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, opacity: f.activo ? 1 : 0.5 }}>
                <input value={f.label} onChange={e => updateFrecuencia(i, 'label', e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>×</span>
                  <input type="number" step="0.05" value={f.mult} onChange={e => updateFrecuencia(i, 'mult', Number(e.target.value))}
                    style={{ width: 70, padding: '8px 8px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 14, fontWeight: 800, color: C.primary, fontFamily: 'inherit', textAlign: 'center' }} />
                  <span style={{ fontSize: 11, color: C.muted }}>{f.mult === 1 ? '(sin cambio)' : f.mult > 1 ? `(+${Math.round((f.mult-1)*100)}%)` : `(-${Math.round((1-f.mult)*100)}%)`}</span>
                </div>
                <button onClick={() => updateFrecuencia(i, 'activo', !f.activo)}
                  style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: f.activo ? C.okBg : C.bg, color: f.activo ? C.ok : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {f.activo ? '✓' : '○'}
                </button>
              </div>
            ))}
            <button onClick={addFrecuencia}
              style={{ width: '100%', padding: '12px', background: C.light, border: `2px dashed ${C.brand}`, borderRadius: 10, fontSize: 13, fontWeight: 700, color: C.primary, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Añadir frecuencia
            </button>
          </div>
        )}

        {/* ── RECARGOS ── */}
        {tab === 'recargos' && (
          <div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Incrementos opcionales que el cliente puede seleccionar: urgencia, festivos, zonas difíciles, etc.</div>
            {config.recargos?.map((r: any, i: number) => (
              <div key={i} style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 16px', marginBottom: 8, opacity: r.activo ? 1 : 0.5 }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <input value={r.label} onChange={e => updateRecargo(i, 'label', e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }} />
                  <button onClick={() => updateRecargo(i, 'activo', !r.activo)}
                    style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: r.activo ? C.okBg : C.bg, color: r.activo ? C.ok : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {r.activo ? '✓ Activo' : '○ Inactivo'}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>TIPO</label>
                    <select value={r.tipo} onChange={e => updateRecargo(i, 'tipo', e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, fontFamily: 'inherit' }}>
                      {TIPOS_RECARGO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                      {r.tipo === 'fijo' ? 'IMPORTE (€)' : 'PORCENTAJE (%)'}
                    </label>
                    <input type="number" value={r.valor} onChange={e => updateRecargo(i, 'valor', Number(e.target.value))}
                      style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 14, fontWeight: 800, color: C.primary, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addRecargo}
              style={{ width: '100%', padding: '12px', background: C.light, border: `2px dashed ${C.brand}`, borderRadius: 10, fontSize: 13, fontWeight: 700, color: C.primary, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Añadir recargo
            </button>
          </div>
        )}

        {/* ── TEXTOS ── */}
        {tab === 'textos' && (
          <div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Personaliza los textos que aparecen en la cabecera del cotizador público.</div>
            <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Título principal</label>
                <input value={config.titulo || ''} onChange={e => setConfig((c: any) => ({ ...c, titulo: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subtítulo</label>
                <input value={config.subtitulo || ''} onChange={e => setConfig((c: any) => ({ ...c, subtitulo: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>
        )}

        {/* Guardar sticky */}
        <div style={{ position: 'sticky', bottom: 16, marginTop: 20 }}>
          <button onClick={guardar} disabled={saving}
            style={{ width: '100%', padding: '14px', background: saved ? '#22c55e' : C.primary, border: 'none', borderRadius: 12, fontSize: 14, color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, boxShadow: '0 4px 16px rgba(79,70,229,0.35)' }}>
            {saving ? 'Guardando...' : saved ? '✅ Cambios guardados' : '💾 Guardar todos los cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
