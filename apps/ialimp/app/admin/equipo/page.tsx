'use client'
import { useState, useEffect } from 'react'
import PisosLimpiadora from './PisosLimpiadora'
import Tarifas from './Tarifas'
import Nominas from './Nominas'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)', bg: '#f1f5f9',
  text: '#1e1b4b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2', white: '#ffffff'
}

// Navegación en 2 niveles: 3 grupos (siempre visibles en móvil) con sus sub-pestañas.
// "Limpiadoras" absorbe el antiguo tab "Equipo" (era la misma entidad + el botón 🤖 Analizar).
const GRUPOS = [
  { id: 'equipo',    label: '👥 Equipo',    subs: [
    { id: 'limpiadoras',    label: '🧹 Limpiadoras' },
    { id: 'disponibilidad', label: '📅 Disponibilidad' },
    { id: 'accesos',        label: '🔐 Accesos del equipo' },
  ]},
  { id: 'economia',  label: '💶 Economía',  subs: [
    { id: 'tarifas', label: '💶 Tarifas' },
    { id: 'nominas', label: '🧾 Nóminas' },
  ]},
  { id: 'operacion', label: '🛠️ Operación', subs: [
    { id: 'quejas', label: '⚠️ Quejas' },
    { id: 'kits',   label: '🎒 Kits' },
    { id: 'ia',     label: '🤖 Análisis IA' },
  ]},
]

export default function EquipoPage() {
  const [grupo, setGrupo] = useState('equipo')
  const [sub, setSub]     = useState('limpiadoras')

  const grupoActual = GRUPOS.find(g => g.id === grupo) || GRUPOS[0]

  function seleccionarGrupo(gid: string) {
    const g = GRUPOS.find(x => x.id === gid)
    if (!g) return
    setGrupo(gid)
    setSub(g.subs[0].id)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Nunito', sans-serif" }}>
      <header style={{ background: C.primary, padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0 14px' }}>
          <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none' }}>← Dashboard</a>
          <h1 style={{ color: C.white, fontWeight: 800, fontSize: 20 }}>Equipo</h1>
        </div>
        {/* Nivel 1 — grupos (segmented control, sin scroll horizontal) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 12 }}>
          {GRUPOS.map(g => {
            const activo = grupo === g.id
            return (
              <button key={g.id} onClick={() => seleccionarGrupo(g.id)}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 14, whiteSpace: 'nowrap',
                  background: activo ? C.white : 'rgba(255,255,255,0.14)',
                  color: activo ? C.primary : 'rgba(255,255,255,0.85)',
                  fontWeight: activo ? 800 : 600,
                }}>
                {g.label}
              </button>
            )
          })}
        </div>
      </header>

      {/* Nivel 2 — sub-pestañas del grupo activo */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 960, margin: '0 auto' }}>
          {grupoActual.subs.map(s => {
            const activo = sub === s.id
            return (
              <button key={s.id} onClick={() => setSub(s.id)}
                style={{
                  padding: '12px 14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: 'transparent', whiteSpace: 'nowrap', fontSize: 13,
                  color: activo ? C.primary : C.muted,
                  fontWeight: activo ? 800 : 500,
                  borderBottom: `2.5px solid ${activo ? C.primary : 'transparent'}`,
                }}>
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>
        {sub === 'limpiadoras'    && <TabLimpiadoras />}
        {sub === 'disponibilidad' && <TabDisponibilidad />}
        {sub === 'accesos'        && <TabUsuarios />}
        {sub === 'tarifas'        && <Tarifas />}
        {sub === 'nominas'        && <Nominas />}
        {sub === 'quejas'         && <TabQuejas />}
        {sub === 'kits'           && <TabKits />}
        {sub === 'ia'             && <TabAnalisisIA />}
      </div>
    </div>
  )
}

// ─── TAB QUEJAS ──────────────────────────────────────────────────
function TabQuejas() {
  const [quejas, setQuejas]           = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [clasificaciones, setClass]   = useState<Record<string,any>>({})
  const [clasificando, setClasif]     = useState<string|null>(null)
  const [filtro, setFiltro]           = useState('pendiente')

  const ESTADO_QUEJA: Record<string,{label:string;color:string;bg:string}> = {
    pendiente:  { label: 'Pendiente',  color: C.warn,    bg: C.warnBg },
    contactado: { label: 'Contactado', color: C.brand,   bg: C.light  },
    resuelto:   { label: 'Resuelto',   color: C.ok,      bg: C.okBg   },
  }

  useEffect(() => { cargar() }, [])
  async function cargar() {
    setLoading(true)
    const r = await fetch('/api/admin/quejas')
    const d = await r.json()
    setQuejas(d.quejas || [])
    setLoading(false)
  }

  async function cambiarEstado(id: string, estado: string) {
    await fetch('/api/admin/quejas/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }) })
    setQuejas(qs => qs.map(q => q.id === id ? { ...q, estado } : q))
  }

  async function clasificarIA(q: any) {
    setClasif(q.id)
    try {
      const r = await fetch('/api/admin/ia/clasificar-queja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queja_id: q.id, descripcion: q.descripcion, sesion_id: q.sesion_id }) })
      const d = await r.json()
      if (d.ok) setClass(prev => ({ ...prev, [q.id]: d }))
    } catch {}
    setClasif(null)
  }

  const filtradas = filtro === 'todas' ? quejas : quejas.filter(q => q.estado === filtro)
  const pendientes = quejas.filter(q => q.estado === 'pendiente').length

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['todas','pendiente','contactado','resuelto'].map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: filtro === f ? 700 : 400,
              background: filtro === f ? C.primary : C.bg, color: filtro === f ? C.white : C.muted }}>
            {f === 'todas' ? 'Todas' : ESTADO_QUEJA[f]?.label} {f === 'pendiente' && pendientes > 0 ? `(${pendientes})` : ''}
          </button>
        ))}
      </div>

      {filtradas.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 700 }}>Sin quejas {filtro !== 'todas' ? 'en este estado' : 'registradas'}</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtradas.map((q: any) => {
          const est = ESTADO_QUEJA[q.estado] || ESTADO_QUEJA.pendiente
          const cls = clasificaciones[q.id]
          return (
            <div key={q.id} style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: '16px 18px', borderLeft: `4px solid ${est.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: est.bg, color: est.color }}>{est.label}</span>
                  {q.categoria && <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>{q.categoria}</span>}
                </div>
                <span style={{ fontSize: 11, color: C.muted }}>{q.created_at ? new Date(q.created_at).toLocaleDateString('es-ES') : ''}</span>
              </div>
              <p style={{ fontSize: 14, color: C.text, margin: '0 0 8px', lineHeight: 1.5 }}>{q.descripcion}</p>
              {q.propiedad_nombre && <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>📍 {q.propiedad_nombre} {q.limpiadora_nombre ? `· 🧹 ${q.limpiadora_nombre}` : ''}</div>}
              {cls && (
                <div style={{ background: C.light, borderRadius: 8, padding: '10px 12px', marginBottom: 8, fontSize: 12 }}>
                  <strong>Cat:</strong> {cls.categoria} · <strong>Severidad:</strong> {cls.severidad}
                  {cls.afecta_expediente_rrhh && <span style={{ color: C.red, fontWeight: 600, marginLeft: 8 }}>⚠️ Expediente RRHH</span>}
                  {cls.patron_detectado && <span style={{ color: C.warn, fontWeight: 600, marginLeft: 8 }}>📊 Patrón</span>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {q.estado === 'pendiente' && <>
                  <button onClick={() => cambiarEstado(q.id, 'contactado')} style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${C.warn}`, background: C.warnBg, color: C.warn, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>📞 Contactado</button>
                  <button onClick={() => cambiarEstado(q.id, 'resuelto')} style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${C.ok}`, background: C.okBg, color: C.ok, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✅ Resuelto</button>
                </>}
                {q.estado === 'contactado' && (
                  <button onClick={() => cambiarEstado(q.id, 'resuelto')} style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${C.ok}`, background: C.okBg, color: C.ok, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✅ Resuelto</button>
                )}
                {!cls && (
                  <button onClick={() => clasificarIA(q)} disabled={clasificando === q.id} style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.brand, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {clasificando === q.id ? 'Analizando...' : '✨ Clasificar IA'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── TAB LIMPIADORAS ─────────────────────────────────────────────
function TabLimpiadoras() {
  const [limpiadoras, setLimpiadoras] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', telefono: '', pin: '', color: '#6366f1' })
  const [saving, setSaving] = useState(false)
  const [expandedPisos, setExpandedPisos] = useState<string|null>(null)
  const [accesoFor, setAccesoFor] = useState<string|null>(null)
  const [accesoUrl, setAccesoUrl] = useState('')
  const [accesoLoading, setAccesoLoading] = useState(false)
  const [copiado, setCopiado] = useState(false)
  // Análisis RRHH/IA por limpiadora (antes vivía en el tab "Equipo", ahora integrado aquí)
  const [analisis, setAnalisis]       = useState<Record<string,any>>({})
  const [analizando, setAnalizando]   = useState<string|null>(null)

  async function analizarLimpiadora(id: string) {
    if (analisis[id]) { setAnalisis(prev => { const n = { ...prev }; delete n[id]; return n }); return }
    setAnalizando(id)
    try {
      const r = await fetch('/api/admin/rrhh/analisis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limpiadora_id: id })
      })
      const d = await r.json()
      if (d.ok) setAnalisis(prev => ({ ...prev, [id]: d.analisis }))
    } catch {}
    setAnalizando(null)
  }

  async function abrirAcceso(l: any, regenerate = false) {
    if (accesoFor === l.id && !regenerate) { setAccesoFor(null); return }
    setAccesoFor(l.id); setAccesoLoading(true); setAccesoUrl(''); setCopiado(false)
    try {
      const r = await fetch(`/api/admin/limpiadoras/${l.id}/acceso`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate }),
      })
      const d = await r.json()
      if (d.token) setAccesoUrl(`${window.location.origin}/l/acceso/${d.token}`)
    } finally {
      setAccesoLoading(false)
    }
  }
  function mensajeAcceso(l: any, url: string) {
    return `Hola ${l.nombre} 👋 Este es tu acceso a la app de limpiezas. Solo tienes que tocar este enlace y entrarás directa, sin contraseñas: ${url}`
  }
  function whatsappHref(l: any, url: string) {
    const texto = encodeURIComponent(mensajeAcceso(l, url))
    const tel = (l.telefono || '').replace(/[^0-9]/g, '')
    return tel ? `https://wa.me/${tel}?text=${texto}` : `https://wa.me/?text=${texto}`
  }

  useEffect(() => { cargar() }, [])
  async function cargar() {
    const r = await fetch('/api/admin/limpiadoras')
    const d = await r.json()
    setLimpiadoras(d.limpiadoras || [])
    setLoading(false)
  }

  async function guardar() {
    if (!form.nombre.trim()) return
    setSaving(true)
    await fetch('/api/admin/limpiadoras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    await cargar()
    setShowForm(false)
    setForm({ nombre: '', telefono: '', pin: '', color: '#6366f1' })
    setSaving(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => setShowForm(!showForm)}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.primary, color: C.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Nueva limpiadora
        </button>
      </div>

      {showForm && (
        <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: '16px 18px', marginBottom: 16 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 12 }}>Nueva limpiadora</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {[{k:'nombre',ph:'Nombre *'},{k:'telefono',ph:'Teléfono'},{k:'pin',ph:'PIN (4 dígitos)'}].map(f => (
              <input key={f.k} placeholder={f.ph} value={(form as any)[f.k]}
                onChange={e => setForm(p => ({...p, [f.k]: e.target.value}))}
                style={{ padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: C.muted }}>Color</label>
              <input type="color" value={form.color} onChange={e => setForm(p => ({...p, color: e.target.value}))}
                style={{ width: 36, height: 36, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={guardar} disabled={saving || !form.nombre.trim()}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: C.primary, color: C.white, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Guardando...' : 'Crear limpiadora'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {limpiadoras.map((l: any) => (
          <div key={l.id} style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', borderLeft: `4px solid ${l.color || C.brand}` }}>
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: l.color || C.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.white, fontWeight: 800 }}>
                {l.nombre?.[0]?.toUpperCase() || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{l.nombre}</div>
                {l.telefono && <div style={{ fontSize: 12, color: C.muted }}>📞 {l.telefono}</div>}
              </div>
              <button
                onClick={() => setExpandedPisos(expandedPisos === l.id ? null : l.id)}
                style={{ fontSize: 12, color: expandedPisos === l.id ? C.primary : C.brand, padding: '5px 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: expandedPisos === l.id ? C.light : C.white, cursor: 'pointer', fontWeight: 700 }}>
                🏠 Pisos {expandedPisos === l.id ? '▲' : '▼'}
              </button>
              <button
                onClick={() => abrirAcceso(l)}
                style={{ fontSize: 12, color: accesoFor === l.id ? C.primary : C.brand, padding: '5px 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: accesoFor === l.id ? C.light : C.white, cursor: 'pointer', fontWeight: 700 }}>
                📲 Enviar acceso
              </button>
              <button
                onClick={() => analizarLimpiadora(l.id)} disabled={analizando === l.id}
                style={{ fontSize: 12, color: analisis[l.id] ? C.primary : C.brand, padding: '5px 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: analisis[l.id] ? C.light : C.white, cursor: 'pointer', fontWeight: 700, opacity: analizando === l.id ? 0.6 : 1 }}>
                {analizando === l.id ? 'Analizando…' : `🤖 Analizar${analisis[l.id] ? ' ▲' : ''}`}
              </button>
              <a href={`/admin/usuarios`} style={{ fontSize: 12, color: C.brand, textDecoration: 'none', padding: '5px 10px', border: `1px solid ${C.border}`, borderRadius: 8 }}>
                Ver acceso
              </a>
            </div>
            {analisis[l.id] && (() => {
              const a = analisis[l.id]
              return (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: '14px 18px' }}>
                  <div style={{ background: a.recomendacion_tipo === 'positiva' ? C.okBg : a.recomendacion_tipo === 'urgente' ? C.redBg : C.warnBg, borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13, color: a.recomendacion_tipo === 'positiva' ? C.ok : a.recomendacion_tipo === 'urgente' ? C.red : C.warn, fontWeight: 600 }}>
                    {a.recomendacion_tipo === 'positiva' ? '✅ Buen rendimiento' : a.recomendacion_tipo === 'urgente' ? '🔴 Requiere atención' : '⚠️ Revisar'} — {a.recomendacion}
                  </div>
                  <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, margin: 0 }}>{a.resumen}</p>
                </div>
              )
            })()}
            {accesoFor === l.id && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 18px', background: C.light }}>
                {accesoLoading ? (
                  <div style={{ color: C.muted, fontSize: 13 }}>Generando enlace…</div>
                ) : accesoUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>
                      Enlace de acceso directo (la limpiadora entra sin PIN ni contraseña):
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <input readOnly value={accesoUrl} onFocus={e => e.target.select()}
                        style={{ flex: 1, minWidth: 200, padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontFamily: 'inherit', background: C.white, color: C.text }} />
                      <button onClick={async () => { await navigator.clipboard.writeText(accesoUrl); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}
                        style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: C.primary, color: C.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        {copiado ? '✓ Copiado' : 'Copiar'}
                      </button>
                      <a href={whatsappHref(l, accesoUrl)} target="_blank" rel="noopener noreferrer"
                        style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: C.ok, color: C.white, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                        WhatsApp
                      </a>
                    </div>
                    <button onClick={() => abrirAcceso(l, true)}
                      style={{ alignSelf: 'flex-start', fontSize: 11, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                      Regenerar enlace (invalida el anterior)
                    </button>
                  </div>
                ) : (
                  <div style={{ color: C.red, fontSize: 13 }}>No se pudo generar el enlace.</div>
                )}
              </div>
            )}
            {expandedPisos === l.id && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 18px' }}>
                <PisosLimpiadora limpiadoraId={l.id} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── TAB DISPONIBILIDAD ──────────────────────────────────────────
function TabDisponibilidad() {
  const [limpiadoras, setLimpiadoras]     = useState<any[]>([])
  const [disponibilidad, setDisp]         = useState<Record<string,any[]>>({})
  const [ausencias, setAusencias]         = useState<any[]>([])
  const [selected, setSelected]           = useState<string|null>(null)
  const [saving, setSaving]               = useState(false)
  const [newAus, setNewAus]               = useState({ limpiadora_id: '', fecha_inicio: '', fecha_fin: '', motivo: 'vacaciones', notas: '' })

  const DIAS_LABEL = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

  useEffect(() => { cargar() }, [])
  async function cargar() {
    const [rL, rA] = await Promise.all([fetch('/api/admin/limpiadoras'), fetch('/api/admin/ausencias')])
    const [dL, dA] = await Promise.all([rL.json(), rA.json()])
    setLimpiadoras(dL.limpiadoras || [])
    setAusencias(dA.ausencias || [])
    const disp: Record<string,any[]> = {}
    for (const l of (dL.limpiadoras || [])) {
      const r = await fetch(`/api/admin/disponibilidad?limpiadora_id=${l.id}`)
      const d = await r.json()
      disp[l.id] = d.disponibilidad || []
    }
    setDisp(disp)
  }

  async function toggleDia(limp_id: string, dia: number, turno: string) {
    const actual = (disponibilidad[limp_id] || []).find((d: any) => d.dia_semana === dia && d.turno === turno)
    setSaving(true)
    if (actual) {
      await fetch('/api/admin/disponibilidad', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: actual.id }) })
    } else {
      await fetch('/api/admin/disponibilidad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limpiadora_id: limp_id, dia_semana: dia, turno }) })
    }
    const r = await fetch(`/api/admin/disponibilidad?limpiadora_id=${limp_id}`)
    const d = await r.json()
    setDisp(prev => ({ ...prev, [limp_id]: d.disponibilidad || [] }))
    setSaving(false)
  }

  async function addAusencia() {
    if (!newAus.limpiadora_id || !newAus.fecha_inicio || !newAus.fecha_fin) return
    setSaving(true)
    await fetch('/api/admin/ausencias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newAus) })
    const r = await fetch('/api/admin/ausencias')
    const d = await r.json()
    setAusencias(d.ausencias || [])
    setNewAus({ limpiadora_id: '', fecha_inicio: '', fecha_fin: '', motivo: 'vacaciones', notas: '' })
    setSaving(false)
  }

  async function deleteAusencia(id: string) {
    if (!confirm('¿Eliminar ausencia?')) return
    await fetch('/api/admin/ausencias', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setAusencias(prev => prev.filter((a: any) => a.id !== id))
  }

  return (
    <div>
      <h3 style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 12 }}>Disponibilidad semanal</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {limpiadoras.map((l: any) => {
          const disp = disponibilidad[l.id] || []
          const isOpen = selected === l.id
          return (
            <div key={l.id} style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div onClick={() => setSelected(isOpen ? null : l.id)} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: l.color || C.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.white, fontWeight: 800, fontSize: 14 }}>
                  {l.nombre?.[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 14, color: C.text }}>{l.nombre}</div>
                <span style={{ fontSize: 12, color: C.muted }}>{disp.length} turnos · {isOpen ? '▲' : '▼'}</span>
              </div>
              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 16px' }}>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table style={{ width: '100%', minWidth: 360, borderCollapse: 'separate', borderSpacing: '4px 4px', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ color: C.muted, fontWeight: 600, padding: '4px 8px', textAlign: 'left' }}>Turno</th>
                          {DIAS_LABEL.map(d => <th key={d} style={{ color: C.muted, fontWeight: 600, padding: '4px 8px' }}>{d}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {['mañana', 'tarde', 'completo'].map(turno => (
                          <tr key={turno}>
                            <td style={{ padding: '4px 8px', fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>{turno}</td>
                            {[1,2,3,4,5,6,7].map(dia => {
                              const activo = disp.some((d: any) => d.dia_semana === dia && d.turno === turno)
                              return (
                                <td key={dia} style={{ textAlign: 'center', padding: '4px' }}>
                                  <button onClick={() => toggleDia(l.id, dia, turno)} disabled={saving}
                                    style={{ width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
                                      background: activo ? C.brand : C.bg, color: activo ? C.white : C.muted, fontWeight: 700, fontSize: 14 }}>
                                    {activo ? '✓' : '·'}
                                  </button>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <h3 style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 12 }}>Ausencias y vacaciones</h3>
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <select value={newAus.limpiadora_id} onChange={e => setNewAus(p => ({...p, limpiadora_id: e.target.value}))}
            style={{ padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
            <option value="">Limpiadora...</option>
            {limpiadoras.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
          <select value={newAus.motivo} onChange={e => setNewAus(p => ({...p, motivo: e.target.value}))}
            style={{ padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
            {['vacaciones','baja','personal','otro'].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="date" value={newAus.fecha_inicio} onChange={e => setNewAus(p => ({...p, fecha_inicio: e.target.value}))}
            style={{ padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          <input type="date" value={newAus.fecha_fin} onChange={e => setNewAus(p => ({...p, fecha_fin: e.target.value}))}
            style={{ padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
        </div>
        <button onClick={addAusencia} disabled={saving || !newAus.limpiadora_id || !newAus.fecha_inicio || !newAus.fecha_fin}
          style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: C.primary, color: C.white, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Añadir ausencia
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ausencias.map((a: any) => (
          <div key={a.id} style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{a.limpiadora_nombre}</span>
              <span style={{ fontSize: 12, color: C.muted, marginLeft: 10 }}>{a.fecha_inicio} → {a.fecha_fin} · {a.motivo}</span>
            </div>
            <button onClick={() => deleteAusencia(a.id)} style={{ background: 'none', border: 'none', color: C.red, fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── TAB ACCESOS DEL EQUIPO ──────────────────────────────────────
const MODULOS_LABEL: Record<string, { label: string; icon: string }> = {
  sesiones: { label: 'Sesiones', icon: '📋' }, clientes: { label: 'Clientes', icon: '🏠' },
  rrhh: { label: 'RRHH', icon: '👥' }, lenceria: { label: 'Lencería', icon: '🛏️' },
  stock: { label: 'Stock', icon: '🧴' }, facturacion: { label: 'Facturación', icon: '💶' },
  informes: { label: 'Informes', icon: '📊' }, agenda: { label: 'Agenda', icon: '📅' },
  configuracion: { label: 'Configuración', icon: '⚙️' },
}
const TIPOS_INFO: Record<string, { icon: string; label: string; sub: string; color: string; bg: string; border: string }> = {
  admin_solo:  { icon: '👤', label: 'Panel admin',           sub: 'Entran al panel web con email y contraseña', color: '#4f46e5', bg: '#eef2ff', border: '#a5b4fc' },
  admin_y_app: { icon: '🔑', label: 'Panel + App limpieza',  sub: 'Acceso completo: panel web Y app móvil con PIN', color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
  solo_app:    { icon: '🧹', label: 'Limpiadoras',           sub: 'Solo la app móvil /l con PIN, sin panel', color: '#059669', bg: '#f0fdf4', border: '#6ee7b7' },
}
const ORDEN_TIPOS = ['admin_solo', 'admin_y_app', 'solo_app']

function TabUsuarios() {
  const [personas, setPersonas] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { cargar() }, [])
  async function cargar() {
    setLoading(true)
    // Combina usuarios de panel + limpiadoras (igual que /admin/usuarios) para clasificar bien el rol.
    const [rU, rL] = await Promise.all([
      fetch('/api/admin/usuarios-empresa').then(r => r.json()).catch(() => ({})),
      fetch('/api/admin/limpiadoras').then(r => r.json()).catch(() => ({})),
    ])
    const usuarios: any[] = (rU.usuarios || []).map((u: any) => ({
      ...u, _tipo: u.modulos?.includes('limpiadora') ? 'admin_y_app' : 'admin_solo',
    }))
    const idsVinculados = new Set(usuarios.map((u: any) => u.limpiadora_id).filter(Boolean))
    const limpSueltas: any[] = (rL.limpiadoras || [])
      .filter((l: any) => !idsVinculados.has(l.id))
      .map((l: any) => ({ id: l.id, nombre: l.nombre, email: null, modulos: ['limpiadora'], activo: l.activa, _tipo: 'solo_app' }))
    setPersonas([...usuarios, ...limpSueltas])
    setLoading(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando...</div>

  const porTipo = ORDEN_TIPOS
    .map(t => ({ tipo: t, info: TIPOS_INFO[t], gente: personas.filter(p => p._tipo === t) }))
    .filter(g => g.gente.length > 0)

  return (
    <div>
      {/* Cabecera: qué es esto + acceso a la gestión completa */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, color: C.text, margin: 0 }}>Quién forma tu equipo</h3>
          <p style={{ fontSize: 12.5, color: C.muted, margin: '3px 0 0', lineHeight: 1.4 }}>
            Todas las personas con acceso —administración, limpiadoras, contabilidad…— agrupadas por rol. {personas.length} en total.
          </p>
        </div>
        <a href="/admin/usuarios"
          style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: C.primary, color: C.white, fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          ➕ Añadir / gestionar
        </a>
      </div>

      {personas.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>👥</div>
          <div style={{ fontWeight: 700 }}>Aún no hay nadie en el equipo</div>
        </div>
      )}

      {porTipo.map(({ tipo, info, gente }) => (
        <div key={tipo} style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16 }}>{info.icon}</span>
            <span style={{ fontWeight: 800, fontSize: 13.5, color: info.color }}>{info.label}</span>
            <span style={{ fontSize: 11.5, color: C.muted, background: C.bg, borderRadius: 20, padding: '1px 9px', fontWeight: 700 }}>{gente.length}</span>
            <span style={{ fontSize: 11.5, color: C.muted }}>· {info.sub}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {gente.map((p: any) => (
              <div key={p.id} style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12, opacity: p.activo === false ? 0.55 : 1 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: info.bg, border: `2px solid ${info.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {info.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 14.5, color: C.text }}>{p.nombre}</span>
                    {p.activo === false && <span style={{ fontSize: 10, color: C.muted, background: C.bg, borderRadius: 6, padding: '2px 7px' }}>Inactivo</span>}
                  </div>
                  {p.email && <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{p.email}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(p._tipo === 'admin_y_app' || p._tipo === 'solo_app') && (
                      <span style={{ fontSize: 10, background: '#f0fdf4', color: '#059669', borderRadius: 6, padding: '2px 7px', fontWeight: 600 }}>🧹 App /l con PIN</span>
                    )}
                    {(p._tipo === 'admin_solo' || p._tipo === 'admin_y_app') && (
                      <span style={{ fontSize: 10, background: C.light, color: C.primary, borderRadius: 6, padding: '2px 7px', fontWeight: 600 }}>💻 Panel admin</span>
                    )}
                    {(p.modulos || []).filter((m: string) => m !== 'limpiadora').map((m: string) => {
                      const mod = MODULOS_LABEL[m]
                      return mod ? <span key={m} style={{ fontSize: 10, background: C.bg, borderRadius: 6, padding: '2px 7px', color: C.text }}>{mod.icon} {mod.label}</span> : null
                    })}
                  </div>
                  {p.ultimo_acceso && (
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 5 }}>
                      Último acceso: {new Date(p.ultimo_acceso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── TAB ANÁLISIS IA ─────────────────────────────────────────────
function TabAnalisisIA() {
  const [analisis, setAnalisis] = useState<any>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function analizar() {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/admin/ia/patrones')
      const d = await r.json()
      if (d.ok) setAnalisis(d.analisis)
      else setError(d.error || 'Error al analizar')
    } catch { setError('Error de conexión') }
    setLoading(false)
  }

  if (!analisis && !loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🤖</div>
      <h2 style={{ fontWeight: 800, fontSize: 22, color: C.text, marginBottom: 8 }}>Análisis inteligente del equipo</h2>
      <p style={{ color: C.muted, fontSize: 14, marginBottom: 28, maxWidth: 400, margin: '0 auto 28px' }}>
        La IA analiza los últimos 60 días: quejas, rendimiento por limpiadora y patrones ocultos.
      </p>
      {error && <p style={{ color: C.red, marginBottom: 16 }}>{error}</p>}
      <button onClick={analizar} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 12, padding: '12px 28px', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
        🔍 Analizar ahora
      </button>
    </div>
  )

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
      <p style={{ color: C.muted }}>Buscando patrones en los datos...</p>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={analizar} style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.brand }}>
          🔄 Re-analizar
        </button>
      </div>
      {analisis.alertas?.map((a: any, i: number) => (
        <div key={i} style={{ background: C.redBg, borderRadius: 12, border: `1px solid #fecaca`, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.red, marginBottom: 4 }}>🔴 {a.titulo}</div>
          <p style={{ fontSize: 13, color: C.text, margin: 0 }}>{a.descripcion}</p>
        </div>
      ))}
      {analisis.insights?.map((ins: any, i: number) => (
        <div key={i} style={{ background: C.light, borderRadius: 12, border: `1px solid #c7d2fe`, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.primary, marginBottom: 4 }}>💡 {ins.titulo || ins.patron}</div>
          <p style={{ fontSize: 13, color: C.text, margin: 0 }}>{ins.descripcion || ins.detalle}</p>
        </div>
      ))}
      {analisis.recomendaciones?.map((r: any, i: number) => (
        <div key={i} style={{ background: C.okBg, borderRadius: 12, border: `1px solid #bbf7d0`, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.ok, marginBottom: 4 }}>✅ {r.titulo || r.accion}</div>
          <p style={{ fontSize: 13, color: C.text, margin: 0 }}>{r.descripcion || r.detalle}</p>
        </div>
      ))}
      {(!analisis.alertas?.length && !analisis.insights?.length && !analisis.recomendaciones?.length) && (
        <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: '20px' }}>
          <p style={{ fontSize: 14, color: C.text, lineHeight: 1.6 }}>{analisis.resumen || analisis.texto || JSON.stringify(analisis)}</p>
        </div>
      )}
    </div>
  )
}


// ─── TAB KITS ─────────────────────────────────────────────────────
function TabKits() {
  const [limpiadoras, setLimpiadoras] = useState<any[]>([])
  const [productos,   setProductos]   = useState<any[]>([])
  const [kits,        setKits]        = useState<any[]>([])
  const [reposiciones,setReposiciones]= useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [selLimp,     setSelLimp]     = useState<string>('all')
  const [modalKit,    setModalKit]    = useState<any>(null)   // {} = nuevo kit
  const [modalRepo,   setModalRepo]   = useState<any>(null)   // kit para reponer
  const [saving,      setSaving]      = useState(false)
  const [formKit,     setFormKit]     = useState<any>({ limpiadora_id:'', producto_id:'', cantidad_inicial:'1', notas:'' })
  const [formRepo,    setFormRepo]    = useState<any>({ cantidad:'', notas:'' })
  const [expandRepo,  setExpandRepo]  = useState<string|null>(null)

  const load = async () => {
    setLoading(true)
    const [rL, rP, rK, rR] = await Promise.all([
      fetch('/api/admin/limpiadoras'),
      fetch('/api/admin/stock'),
      fetch('/api/admin/kits'),
      fetch('/api/admin/reposiciones'),
    ])
    const [dL, dP, dK, dR] = await Promise.all([rL.json(), rP.json(), rK.json(), rR.json()])
    setLimpiadoras(dL.limpiadoras || [])
    setProductos(dP.productos || [])
    setKits(dK.kits || [])
    setReposiciones(dR.reposiciones || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const saveKit = async () => {
    if (!formKit.limpiadora_id || !formKit.producto_id) return
    setSaving(true)
    await fetch('/api/admin/kits', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(formKit) })
    setSaving(false); setModalKit(null); load()
  }

  const delKit = async (id: string) => {
    if (!confirm('¿Quitar este producto del kit?')) return
    await fetch('/api/admin/kits', { method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id }) })
    load()
  }

  const saveRepo = async () => {
    if (!formRepo.cantidad || !modalRepo) return
    setSaving(true)
    const r = await fetch('/api/admin/reposiciones', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ kit_id: modalRepo.id, cantidad: formRepo.cantidad, notas: formRepo.notas }) })
    const d = await r.json()
    setSaving(false); setModalRepo(null)
    setFormRepo({ cantidad:'', notas:'' })
    if (d.ok) {
      const msg = d.sesiones_previas > 0
        ? `✅ Repuesto. ${d.sesiones_previas} sesiones desde la última reposición${d.coste ? ` · coste ${Number(d.coste).toFixed(2)} €` : ''}`
        : '✅ Reposición registrada'
      alert(msg)
    }
    load()
  }

  const filteredKits = selLimp === 'all' ? kits : kits.filter((k:any) => k.limpiadora_id === selLimp)

  // Group by limpiadora
  const byLimp: Record<string, any[]> = {}
  for (const k of filteredKits) {
    if (!byLimp[k.limpiadora_id]) byLimp[k.limpiadora_id] = []
    byLimp[k.limpiadora_id].push(k)
  }

  // KPIs
  const totalProductos = kits.length
  const necesitanRepo  = kits.filter((k:any) => k.nivel_actual !== null && k.nivel_actual < 25).length
  const totalRepos     = reposiciones.length

  if (loading) return <div style={{ textAlign:'center', padding:40, color:C.muted }}>Cargando...</div>

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:'12px 16px', flex:1, minWidth:90 }}>
          <div style={{ fontWeight:800, fontSize:20, color:C.primary }}>{totalProductos}</div>
          <div style={{ fontSize:11, color:C.muted }}>Artículos asignados</div>
        </div>
        <div style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:'12px 16px', flex:1, minWidth:90 }}>
          <div style={{ fontWeight:800, fontSize:20, color:necesitanRepo>0?C.red:C.ok }}>{necesitanRepo}</div>
          <div style={{ fontSize:11, color:C.muted }}>⚠️ Reponer pronto</div>
        </div>
        <div style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:'12px 16px', flex:1, minWidth:90 }}>
          <div style={{ fontWeight:800, fontSize:20, color:C.brand }}>{totalRepos}</div>
          <div style={{ fontSize:11, color:C.muted }}>Reposiciones totales</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, marginBottom:14, alignItems:'center', flexWrap:'wrap' }}>
        <select value={selLimp} onChange={e=>setSelLimp(e.target.value)}
          style={{ border:`1px solid ${C.border}`, borderRadius:9, padding:'8px 12px', fontSize:13, fontFamily:'inherit', background:C.white, flex:1 }}>
          <option value="all">Todas las limpiadoras</option>
          {limpiadoras.map((l:any) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
        <button onClick={() => setModalKit({})}
          style={{ background:C.primary, color:'#fff', border:'none', borderRadius:9, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
          + Asignar producto
        </button>
      </div>

      {/* Lista por limpiadora */}
      {Object.keys(byLimp).length === 0 && (
        <div style={{ textAlign:'center', padding:'40px 16px', color:C.muted }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🎒</div>
          <div style={{ fontWeight:600 }}>Sin kits asignados aún</div>
          <div style={{ fontSize:13, marginTop:4 }}>Asigna productos a tus limpiadoras para empezar a rastrear el consumo</div>
        </div>
      )}

      {Object.entries(byLimp).map(([limp_id, items]: any) => {
        const limp = limpiadoras.find((l:any) => l.id === limp_id)
        return (
          <div key={limp_id} style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:limp?.color||C.brand,
                display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:14 }}>
                {limp?.nombre?.[0]?.toUpperCase()}
              </div>
              <span style={{ fontWeight:700, fontSize:15, color:C.text }}>{limp?.nombre}</span>
              <span style={{ fontSize:12, color:C.muted }}>{items.length} productos</span>
            </div>

            {items.map((kit:any) => {
              const nivel = kit.nivel_actual
              const bajo = nivel !== null && nivel < 25
              const sinFoto = nivel === null
              const reposKit = reposiciones.filter((r:any) => r.kit_id === kit.id)
              const isExpanded = expandRepo === kit.id
              const consumoMedio = kit.consumo_medio

              return (
                <div key={kit.id} style={{ background:bajo?'#fff7ed':C.white, border:`1px solid ${bajo?'#fed7aa':C.border}`,
                  borderRadius:12, padding:'12px 14px', marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                    {/* Nivel visual */}
                    <div style={{ flexShrink:0, width:36, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                      <div style={{ width:24, height:56, border:`2px solid ${C.border}`, borderRadius:4, overflow:'hidden',
                        background:'#f8fafc', position:'relative' }}>
                        <div style={{ position:'absolute', bottom:0, width:'100%',
                          height:`${nivel ?? 0}%`, background: nivel===null?'transparent':nivel<25?C.red:nivel<50?C.warn:C.ok,
                          transition:'height .4s', borderRadius:2 }}/>
                        {sinFoto && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
                          justifyContent:'center', fontSize:10, color:C.muted }}>?</div>}
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, color:nivel===null?C.muted:bajo?C.red:C.ok }}>
                        {nivel !== null ? `${nivel}%` : '—'}
                      </span>
                    </div>

                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:C.text }}>{kit.producto_nombre}</div>
                      <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                        {kit.producto_categoria} · {kit.cantidad_inicial} {kit.producto_unidad}
                        {kit.sesiones_actuales > 0 && ` · ${kit.sesiones_actuales} sesiones`}
                      </div>
                      {consumoMedio && Number(consumoMedio.num_reposiciones) >= 2 && (
                        <div style={{ fontSize:11, color:C.brand, marginTop:3, background:C.light, borderRadius:6, padding:'2px 7px', display:'inline-block' }}>
                          📊 Dura ~{Math.round(Number(consumoMedio.media_sesiones_por_bote))} sesiones/bote
                          {consumoMedio.coste_medio_por_sesion ? ` · ${Number(consumoMedio.coste_medio_por_sesion).toFixed(3)} €/sesión` : ''}
                        </div>
                      )}
                      {bajo && <div style={{ fontSize:11, fontWeight:700, color:C.red, marginTop:3 }}>⚠️ Nivel bajo — reponer pronto</div>}
                      {sinFoto && <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>Sin foto aún — nivel desconocido</div>}
                    </div>

                    {/* Acciones */}
                    <div style={{ display:'flex', flexDirection:'column', gap:5, alignItems:'flex-end', flexShrink:0 }}>
                      <button onClick={() => { setModalRepo(kit); setFormRepo({ cantidad: String(kit.cantidad_inicial||1), notas:'' }) }}
                        style={{ background:C.primary, color:'#fff', border:'none', borderRadius:8, padding:'5px 12px',
                          fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                        🔄 Reponer
                      </button>
                      {reposKit.length > 0 && (
                        <button onClick={() => setExpandRepo(isExpanded ? null : kit.id)}
                          style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, padding:'4px 10px',
                            fontSize:11, color:C.muted, cursor:'pointer', fontFamily:'inherit' }}>
                          {reposKit.length} repo {isExpanded?'▲':'▼'}
                        </button>
                      )}
                      <button onClick={() => delKit(kit.id)}
                        style={{ background:'none', border:'none', color:C.red, cursor:'pointer', fontSize:16, padding:'0 2px' }}>×</button>
                    </div>
                  </div>

                  {/* Historial de reposiciones expandible */}
                  {isExpanded && (
                    <div style={{ borderTop:`1px solid ${C.border}`, marginTop:10, paddingTop:10 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>
                        Historial de reposiciones
                      </div>
                      {reposKit.map((r:any, i:number) => (
                        <div key={r.id} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'4px 0',
                          borderBottom:`1px solid ${C.bg}`, color:C.text }}>
                          <span>{new Date(r.created_at).toLocaleDateString('es-ES')} · {r.cantidad} {r.unidad}</span>
                          <span style={{ color:C.muted }}>
                            {r.sesiones_previas} ses.
                            {r.coste_unitario ? ` · ${(r.cantidad * r.coste_unitario).toFixed(2)} €` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Modal asignar producto */}
      {modalKit !== null && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center',
          justifyContent:'center', zIndex:200, padding:16 }}>
          <div style={{ background:C.white, borderRadius:16, width:'100%', maxWidth:400, padding:24, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontWeight:800, fontSize:17, color:C.text }}>Asignar producto al kit</div>
              <button onClick={() => setModalKit(null)} style={{ background:'none', border:'none', fontSize:22, color:C.muted, cursor:'pointer' }}>×</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
              <select value={formKit.limpiadora_id} onChange={e=>setFormKit((p:any)=>({...p,limpiadora_id:e.target.value}))}
                style={{ border:`1px solid ${C.border}`, borderRadius:9, padding:'10px 12px', fontSize:14, fontFamily:'inherit' }}>
                <option value="">Selecciona limpiadora...</option>
                {limpiadoras.map((l:any) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
              <select value={formKit.producto_id} onChange={e=>setFormKit((p:any)=>({...p,producto_id:e.target.value}))}
                style={{ border:`1px solid ${C.border}`, borderRadius:9, padding:'10px 12px', fontSize:14, fontFamily:'inherit' }}>
                <option value="">Selecciona producto...</option>
                {productos.map((p:any) => (
                  <option key={p.id} value={p.id}>{p.nombre} ({p.unidad}) {p.precio_unitario ? `· ${Number(p.precio_unitario).toFixed(2)}€` : ''}</option>
                ))}
              </select>
              <div style={{ display:'flex', gap:8 }}>
                <input type="number" placeholder="Cantidad inicial" value={formKit.cantidad_inicial}
                  onChange={e=>setFormKit((p:any)=>({...p,cantidad_inicial:e.target.value}))} min="0.1" step="0.1"
                  style={{ flex:1, border:`1px solid ${C.border}`, borderRadius:9, padding:'9px 10px', fontSize:14, fontFamily:'inherit', outline:'none' }}/>
              </div>
              <input placeholder="Notas (opcional)" value={formKit.notas||''}
                onChange={e=>setFormKit((p:any)=>({...p,notas:e.target.value}))}
                style={{ border:`1px solid ${C.border}`, borderRadius:9, padding:'9px 10px', fontSize:13, fontFamily:'inherit', outline:'none' }}/>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setModalKit(null)}
                style={{ flex:1, padding:'10px', borderRadius:9, border:`1px solid ${C.border}`, background:C.white, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
                Cancelar
              </button>
              <button onClick={saveKit} disabled={saving || !formKit.limpiadora_id || !formKit.producto_id}
                style={{ flex:2, padding:'10px', borderRadius:9, border:'none', background:C.primary, color:'#fff',
                  fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:saving?0.6:1 }}>
                {saving ? 'Guardando…' : 'Asignar al kit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal reponer */}
      {modalRepo !== null && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center',
          justifyContent:'center', zIndex:200, padding:16 }}>
          <div style={{ background:C.white, borderRadius:16, width:'100%', maxWidth:380, padding:24, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div style={{ fontWeight:800, fontSize:17, color:C.text }}>Registrar reposición</div>
              <button onClick={() => setModalRepo(null)} style={{ background:'none', border:'none', fontSize:22, color:C.muted, cursor:'pointer' }}>×</button>
            </div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:16 }}>
              {modalRepo.producto_nombre} · {modalRepo.limpiadora_nombre}
              {modalRepo.sesiones_actuales > 0 &&
                <span style={{ display:'block', marginTop:4, color:C.brand, fontWeight:600 }}>
                  📊 {modalRepo.sesiones_actuales} sesiones desde la última reposición
                </span>
              }
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
              <input type="number" placeholder={`Cantidad (${modalRepo.producto_unidad})`}
                value={formRepo.cantidad} onChange={e=>setFormRepo((p:any)=>({...p,cantidad:e.target.value}))} min="0.1" step="0.1"
                style={{ border:`1px solid ${C.border}`, borderRadius:9, padding:'10px 12px', fontSize:14, fontFamily:'inherit', outline:'none' }}/>
              <input placeholder="Notas (opcional)" value={formRepo.notas||''}
                onChange={e=>setFormRepo((p:any)=>({...p,notas:e.target.value}))}
                style={{ border:`1px solid ${C.border}`, borderRadius:9, padding:'9px 10px', fontSize:13, fontFamily:'inherit', outline:'none' }}/>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setModalRepo(null)}
                style={{ flex:1, padding:'10px', borderRadius:9, border:`1px solid ${C.border}`, background:C.white, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
                Cancelar
              </button>
              <button onClick={saveRepo} disabled={saving || !formRepo.cantidad}
                style={{ flex:2, padding:'10px', borderRadius:9, border:'none', background:C.primary, color:'#fff',
                  fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:saving?0.6:1 }}>
                {saving ? 'Guardando…' : '✅ Confirmar reposición'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
