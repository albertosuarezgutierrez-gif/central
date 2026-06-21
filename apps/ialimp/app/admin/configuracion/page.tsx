'use client'
import { useState, useEffect } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)', bg: '#f1f5f9',
  text: '#1e1b4b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2', white: '#ffffff'
}

const TABS_MAIN = [
  { id: 'catalogos', label: '📋 Catálogos' },
  { id: 'cotizador', label: '💰 Cotizador' },
  { id: 'marca',     label: '🎨 Marca' },
]

const SECCIONES = [
  { key: 'tipos_servicio_op',    label: 'Tipos de servicio',       emoji: '🔄', desc: 'Tipos de limpieza que ofrece tu empresa', conEmoji: true,  conDesc: true  },
  { key: 'categorias_stock',     label: 'Categorías de stock',     emoji: '📦', desc: 'Cómo clasificas tus productos',           conEmoji: true,  conDesc: false },
  { key: 'unidades_stock',       label: 'Unidades de medida',      emoji: '📏', desc: 'Kg, litros, unidades…',                  conEmoji: false, conDesc: false },
  { key: 'tipos_lenceria',       label: 'Tipos de lencería',       emoji: '🛏️', desc: 'Sábanas, toallas y ropa de cama',        conEmoji: true,  conDesc: false },
  { key: 'tipos_cliente',        label: 'Tipos de cliente',        emoji: '🏠', desc: 'Segmentos de clientes',                  conEmoji: true,  conDesc: false, conColor: true },
  { key: 'categorias_incidencia',label: 'Categorías de incidencia',emoji: '⚠️', desc: 'Tipos de problema',                     conEmoji: true,  conDesc: false },
  { key: 'niveles_urgencia',     label: 'Niveles de urgencia',     emoji: '🚨', desc: 'Prioridades de incidencias',             conEmoji: false, conDesc: false, conColor: true },
  { key: 'estados_lead',         label: 'Estados del CRM',         emoji: '📊', desc: 'Fases del pipeline comercial',           conEmoji: false, conDesc: false, conColor: true },
  { key: 'tipos_expediente_rrhh',label: 'Tipos expediente RRHH',  emoji: '📋', desc: 'Categorías del historial del personal',  conEmoji: true,  conDesc: false },
]

function ItemEditor({ item, conEmoji, conDesc, conColor, onChange, onDelete }: any) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: C.bg, borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
      {conEmoji && (
        <input value={item.emoji || ''} onChange={e => onChange({ ...item, emoji: e.target.value })}
          style={{ width: 38, textAlign: 'center', fontSize: 18, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 2px', fontFamily: 'inherit', background: C.white }} />
      )}
      <input value={item.label} onChange={e => onChange({ ...item, label: e.target.value })}
        placeholder="Nombre..." style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 13, fontFamily: 'inherit', background: C.white, color: C.text }} />
      {conDesc && (
        <input value={item.desc || ''} onChange={e => onChange({ ...item, desc: e.target.value })}
          placeholder="Descripción..." style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', background: C.white, color: C.muted }} />
      )}
      {conColor && (
        <input type="color" value={item.color || '#6366f1'} onChange={e => onChange({ ...item, color: e.target.value })}
          style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', padding: 2 }} />
      )}
      <button onClick={() => onChange({ ...item, activo: !item.activo })}
        style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
          background: item.activo !== false ? C.okBg : C.redBg, color: item.activo !== false ? C.ok : C.red }}>
        {item.activo !== false ? '✓' : '✗'}
      </button>
      <button onClick={onDelete}
        style={{ padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 14, background: C.redBg, color: C.red }}>
        ✕
      </button>
    </div>
  )
}

function TabCatalogos() {
  const [data, setData]       = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<string | null>(null)
  const [saved, setSaved]     = useState<string | null>(null)
  const [seccion, setSeccion] = useState(SECCIONES[0].key)

  useEffect(() => { cargar() }, [])
  async function cargar() {
    setLoading(true)
    const r = await fetch('/api/admin/catalogos')
    const d = await r.json()
    setData(d.catalogos || {})
    setLoading(false)
  }

  async function guardar(key: string) {
    setSaving(key)
    await fetch('/api/admin/catalogos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: data[key] }) })
    setSaving(null); setSaved(key)
    setTimeout(() => setSaved(null), 2000)
  }

  function addItem(key: string, sec: any) {
    const newItem: any = { id: Date.now().toString(), label: '', activo: true }
    if (sec.conEmoji) newItem.emoji = '📋'
    if (sec.conDesc)  newItem.desc  = ''
    if (sec.conColor) newItem.color = '#6366f1'
    setData((d: any) => ({ ...d, [key]: [...(d[key] || []), newItem] }))
  }

  const sec = SECCIONES.find(s => s.key === seccion)!

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando configuración…</div>

  return (
    <div className="catalogos-grid" style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: C.white }}>
      <style>{`.catalogos-grid{display:grid;grid-template-columns:1fr}@media(min-width:560px){.catalogos-grid{grid-template-columns:200px 1fr}}`}</style>
      <div className="cat-left" style={{ borderRight: `1px solid ${C.border}` }}>
      <style>{`.cat-left{border-bottom:1px solid #e2e8f0}@media(min-width:560px){.cat-left{border-bottom:none}}`}</style>
        {SECCIONES.map(s => (
          <button key={s.key} onClick={() => setSeccion(s.key)}
            style={{ width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${C.border}`,
              background: seccion === s.key ? C.light : C.white,
              borderLeft: `3px solid ${seccion === s.key ? C.primary : 'transparent'}`, fontFamily: 'inherit' }}>
            <div style={{ fontSize: 12, fontWeight: seccion === s.key ? 700 : 500, color: seccion === s.key ? C.primary : C.text }}>
              {s.emoji} {s.label}
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>{(data[s.key] || []).filter((i: any) => i.activo !== false).length} activos</div>
          </button>
        ))}
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, color: C.text, margin: 0 }}>{sec.emoji} {sec.label}</h3>
          <p style={{ color: C.muted, fontSize: 12, margin: '4px 0 0' }}>{sec.desc}</p>
        </div>
        {(data[seccion] || []).map((item: any, idx: number) => (
          <ItemEditor key={item.id || idx} item={item}
            conEmoji={sec.conEmoji} conDesc={sec.conDesc} conColor={sec.conColor}
            onChange={(updated: any) => setData((d: any) => { const arr = [...(d[seccion]||[])]; arr[idx] = updated; return { ...d, [seccion]: arr } })}
            onDelete={() => setData((d: any) => { const arr = [...(d[seccion]||[])]; arr.splice(idx, 1); return { ...d, [seccion]: arr } })} />
        ))}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
          <button onClick={() => addItem(seccion, sec)}
            style={{ padding: '7px 14px', borderRadius: 8, border: `2px dashed ${C.brand}`, background: C.light, color: C.brand, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Añadir
          </button>
          <button onClick={() => guardar(seccion)} disabled={!!saving}
            style={{ padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit',
              background: saved === seccion ? C.ok : C.primary, color: C.white, opacity: saving ? 0.7 : 1 }}>
            {saving === seccion ? 'Guardando…' : saved === seccion ? '✓ Guardado' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TabCotizador() {
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [tab, setTab]         = useState<'servicios'|'frecuencias'|'recargos'|'textos'>('servicios')

  const SUBTABS = [
    { id: 'servicios',  label: '🏠 Servicios' },
    { id: 'frecuencias',label: '🔄 Frecuencias' },
    { id: 'recargos',   label: '💸 Recargos' },
    { id: 'textos',     label: '📝 Textos' },
  ]

  useEffect(() => {
    fetch('/api/admin/cotizador-config').then(r => r.json()).then(d => { setConfig(d.config || {}); setLoading(false) })
  }, [])

  async function guardar() {
    setSaving(true)
    await fetch('/api/admin/cotizador-config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando cotizador…</div>

  return (
    <div>
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{ background: C.light, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {SUBTABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: tab === t.id ? 700 : 500, fontFamily: 'inherit',
                background: tab === t.id ? C.primary : 'transparent', color: tab === t.id ? C.white : C.muted }}>
              {t.label}
            </button>
          ))}
          <button onClick={guardar} disabled={saving}
            style={{ marginLeft: 'auto', padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              background: saved ? C.ok : C.primary, color: C.white, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar cambios'}
          </button>
        </div>
        <div style={{ padding: 20 }}>
          {tab === 'textos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[{k:'titulo',label:'Título principal'},{k:'subtitulo',label:'Subtítulo'}].map(f => (
                <div key={f.k}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 4 }}>{f.label}</label>
                  <input value={config[f.k] || ''} onChange={e => setConfig((c: any) => ({...c, [f.k]: e.target.value}))}
                    style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                </div>
              ))}
            </div>
          )}
          {tab === 'servicios' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12, color: C.muted, margin: '0 0 8px' }}>Servicios disponibles en el cotizador público</p>
              {(config.servicios || []).map((s: any, i: number) => (
                <div key={i} style={{ background: C.bg, borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={s.label || ''} onChange={e => { const arr = [...config.servicios]; arr[i] = {...s, label: e.target.value}; setConfig((c: any) => ({...c, servicios: arr})) }}
                    placeholder="Nombre servicio" style={{ flex: 2, padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }} />
                  <input type="number" value={s.base || ''} onChange={e => { const arr = [...config.servicios]; arr[i] = {...s, base: +e.target.value}; setConfig((c: any) => ({...c, servicios: arr})) }}
                    placeholder="€ base" style={{ width: 80, padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 }} />
                  <button onClick={() => setConfig((c: any) => ({...c, servicios: c.servicios.filter((_: any, j: number) => j !== i)})) }
                    style={{ background: C.redBg, border: 'none', borderRadius: 6, color: C.red, cursor: 'pointer', padding: '4px 8px', fontSize: 14 }}>✕</button>
                </div>
              ))}
              <button onClick={() => setConfig((c: any) => ({...c, servicios: [...(c.servicios||[]), {id: Date.now().toString(), label: '', base: 0, activo: true}]}))}
                style={{ padding: '7px 14px', borderRadius: 8, border: `2px dashed ${C.brand}`, background: C.light, color: C.brand, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: 'fit-content' }}>
                + Añadir servicio
              </button>
            </div>
          )}
          {tab === 'frecuencias' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(config.frecuencias || []).map((f: any, i: number) => (
                <div key={i} style={{ background: C.bg, borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={f.label || ''} onChange={e => { const arr = [...config.frecuencias]; arr[i] = {...f, label: e.target.value}; setConfig((c: any) => ({...c, frecuencias: arr})) }}
                    placeholder="Nombre" style={{ flex: 2, padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }} />
                  <input type="number" step="0.01" value={f.mult || ''} onChange={e => { const arr = [...config.frecuencias]; arr[i] = {...f, mult: +e.target.value}; setConfig((c: any) => ({...c, frecuencias: arr})) }}
                    placeholder="Multiplicador" style={{ width: 110, padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 }} />
                  <button onClick={() => setConfig((c: any) => ({...c, frecuencias: c.frecuencias.filter((_: any, j: number) => j !== i)}))}
                    style={{ background: C.redBg, border: 'none', borderRadius: 6, color: C.red, cursor: 'pointer', padding: '4px 8px', fontSize: 14 }}>✕</button>
                </div>
              ))}
              <button onClick={() => setConfig((c: any) => ({...c, frecuencias: [...(c.frecuencias||[]), {id: Date.now().toString(), label: '', mult: 1, activo: true}]}))}
                style={{ padding: '7px 14px', borderRadius: 8, border: `2px dashed ${C.brand}`, background: C.light, color: C.brand, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: 'fit-content' }}>
                + Añadir frecuencia
              </button>
            </div>
          )}
          {tab === 'recargos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(config.recargos || []).map((r: any, i: number) => (
                <div key={i} style={{ background: C.bg, borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={r.label || ''} onChange={e => { const arr = [...config.recargos]; arr[i] = {...r, label: e.target.value}; setConfig((c: any) => ({...c, recargos: arr})) }}
                    placeholder="Nombre recargo" style={{ flex: 2, padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }} />
                  <input type="number" step="0.01" value={r.pct || ''} onChange={e => { const arr = [...config.recargos]; arr[i] = {...r, pct: +e.target.value}; setConfig((c: any) => ({...c, recargos: arr})) }}
                    placeholder="% recargo" style={{ width: 90, padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 }} />
                  <button onClick={() => setConfig((c: any) => ({...c, recargos: c.recargos.filter((_: any, j: number) => j !== i)}))}
                    style={{ background: C.redBg, border: 'none', borderRadius: 6, color: C.red, cursor: 'pointer', padding: '4px 8px', fontSize: 14 }}>✕</button>
                </div>
              ))}
              <button onClick={() => setConfig((c: any) => ({...c, recargos: [...(c.recargos||[]), {id: Date.now().toString(), label: '', pct: 0, activo: true}]}))}
                style={{ padding: '7px 14px', borderRadius: 8, border: `2px dashed ${C.brand}`, background: C.light, color: C.brand, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: 'fit-content' }}>
                + Añadir recargo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TabMarca() {
  const [b, setB] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { fetch('/api/admin/empresa/branding').then(r => r.json()).then(d => setB(d.branding || {})) }, [])
  if (!b) return <div style={{ color: C.muted }}>Cargando…</div>
  const set = (k: string, v: string) => setB((p: any) => ({ ...p, [k]: v }))
  async function guardar() {
    setSaving(true); setMsg('')
    const r = await fetch('/api/admin/empresa/branding', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marca_nombre: b.marca_nombre || null,
        logo_url: b.logo_url || null,
        color_primario: b.color_primario || '#4f46e5',
        color_secundario: b.color_secundario || '#6366f1',
        color_light: b.color_light || '#eef2ff',
      }),
    })
    const d = await r.json(); setSaving(false)
    setMsg(r.ok ? '✓ Guardado. Se ve en el portal del propietario y la app de la limpiadora.' : (d.error || 'Error al guardar'))
  }
  const prim = b.color_primario || '#4f46e5'
  const light = b.color_light || '#eef2ff'
  const nombre = b.marca_nombre || b.nombre || 'ialimp'
  const lbl = { display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 } as const
  const input = { width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none' } as const
  const colorRow = (k: string, label: string, val: string) => (
    <div style={{ flex: '1 1 160px', minWidth: 140 }}>
      <label style={lbl}>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="color" value={val} onChange={e => set(k, e.target.value)} style={{ width: 40, height: 38, border: `1px solid ${C.border}`, borderRadius: 8, padding: 2, cursor: 'pointer', background: '#fff' }} />
        <input value={val} onChange={e => set(k, e.target.value)} style={{ ...input, fontFamily: 'monospace' }} />
      </div>
    </div>
  )
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, maxWidth: 720 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4 }}>🎨 Tu marca</h2>
      <p style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>
        Personaliza cómo ven tu empresa tus propietarios y tu equipo. Con una sola dirección, cada
        cliente ve su propia marca al iniciar sesión.
      </p>

      <label style={lbl}>Nombre de marca</label>
      <input value={b.marca_nombre || ''} onChange={e => set('marca_nombre', e.target.value)} placeholder={b.nombre || 'Tu marca'} style={{ ...input, marginBottom: 16 }} />

      <label style={lbl}>Logo (URL de imagen, opcional)</label>
      <input value={b.logo_url || ''} onChange={e => set('logo_url', e.target.value)} placeholder="https://…/logo.png" style={{ ...input, marginBottom: 16 }} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        {colorRow('color_primario', 'Color principal', prim)}
        {colorRow('color_secundario', 'Color secundario', b.color_secundario || '#6366f1')}
        {colorRow('color_light', 'Color suave (fondos)', light)}
      </div>

      <label style={lbl}>Vista previa</label>
      <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`, marginBottom: 18 }}>
        <div style={{ background: prim, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {b.logo_url
            ? <img src={b.logo_url} alt="logo" style={{ height: 24 }} />
            : <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>{nombre}</span>}
        </div>
        <div style={{ background: light, padding: '14px 16px' }}>
          <button style={{ background: prim, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, fontFamily: 'inherit', cursor: 'default' }}>Botón de ejemplo</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={guardar} disabled={saving}
          style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 22px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Guardando…' : 'Guardar marca'}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith('✓') ? C.ok : C.red }}>{msg}</span>}
      </div>
    </div>
  )
}

export default function ConfiguracionPage() {
  const [tab, setTab] = useState('catalogos')

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Nunito', sans-serif" }}>
      <header style={{ background: C.primary, padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0 0' }}>
          <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none' }}>← Dashboard</a>
          <h1 style={{ color: C.white, fontWeight: 800, fontSize: 20 }}>⚙️ Configuración</h1>
        </div>
        <div style={{ display: 'flex', gap: 0, marginTop: 12 }}>
          {TABS_MAIN.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '10px 16px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: 'transparent', fontSize: 13,
                color: tab === t.id ? C.white : 'rgba(255,255,255,0.55)',
                fontWeight: tab === t.id ? 700 : 400,
                borderBottom: `2.5px solid ${tab === t.id ? C.white : 'transparent'}` }}>
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>
        {tab === 'catalogos' && <TabCatalogos />}
        {tab === 'cotizador' && <TabCotizador />}
        {tab === 'marca'     && <TabMarca />}
      </div>
    </div>
  )
}
