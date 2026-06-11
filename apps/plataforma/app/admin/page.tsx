// Panel de OPERADOR (god-panel) — un solo sitio para gobernar todas las verticales.
// Auth propia (cookie plataforma_admin); muestra login si no hay sesión de operador.
'use client'
import { useEffect, useState, useCallback, Fragment } from 'react'
import { VERTICALES, MODULOS, AGENTES, RADIOGRAFIA } from '@/lib/estructura'
import type { Propiedad } from '@/lib/propiedades'

const C = { bg: '#0b1020', card: '#151b2e', card2: '#1c2540', border: '#2a3457', text: '#e8ecf7', muted: '#8b97b8', accent: '#6366f1', ok: '#22c55e', okBg: '#0c2a18', red: '#ef4444', redBg: '#2a0c0c' }
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif"

type Metrica = { label: string; valor: string }
type Cliente = { vertical: 'ialimp' | 'sivra' | 'iarest'; id: string; nombre: string; email?: string | null; activo: boolean; puedeBloquear: boolean; metricas: Metrica[] }
type Ficha = Cliente & { detalle: Metrica[]; modulos?: string[] }

const VERT: Record<string, { label: string; icon: string }> = {
  ialimp: { label: 'Limpieza · ialimp', icon: '🧹' },
  sivra: { label: 'Inmobiliario · sivra', icon: '🏠' },
  iarest: { label: 'Hostelería · ia-rest', icon: '🍽️' },
}

export default function OperadorPanel() {
  const [auth, setAuth] = useState<boolean | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [operador, setOperador] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ email: 'alberto.suarez.gutierrez@gmail.com', password: '' })
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<'propiedades' | 'clientes' | 'estructura'>('propiedades')
  const [modulos, setModulos] = useState<{ key: string; label: string; activo: boolean }[]>([])
  const [showNuevo, setShowNuevo] = useState(false)
  const [nuevo, setNuevo] = useState({ vertical: 'ialimp', nombre: '', email: '', password: '', ciudad: '' })
  const [nuevoErr, setNuevoErr] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/admin/clientes')
      if (r.status === 401) { setAuth(false); setLoading(false); return }
      const d = await r.json()
      setClientes(d.clientes || []); setOperador(d.operador || ''); setAuth(true)
    } catch { setError('No se pudo cargar.') }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function login(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const d = await r.json()
    if (d.ok) { cargar() } else setError(d.error || 'Error')
  }

  async function logout() { await fetch('/api/admin/logout', { method: 'POST' }); setAuth(false); setClientes([]) }

  async function toggle(c: Cliente) {
    if (!c.puedeBloquear) return
    setBusy(c.vertical + c.id)
    const r = await fetch(`/api/admin/clientes/${c.vertical}/${encodeURIComponent(c.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !c.activo }),
    })
    if (r.ok) setClientes(cs => cs.map(x => x === c ? { ...x, activo: !x.activo } : x))
    setBusy(null)
  }

  async function ver360(c: Cliente) {
    setFicha(null); setModulos([]); setBusy('f' + c.vertical + c.id)
    const r = await fetch(`/api/admin/clientes/${c.vertical}/${encodeURIComponent(c.id)}`)
    if (r.ok) {
      const d = await r.json(); setFicha(d.ficha)
      const m = await fetch(`/api/admin/clientes/${c.vertical}/${encodeURIComponent(c.id)}/modulos`).then(x => x.ok ? x.json() : { modulos: [] }).catch(() => ({ modulos: [] }))
      setModulos(m.modulos || [])
    }
    setBusy(null)
  }

  async function toggleModulo(m: { key: string; activo: boolean }) {
    if (!ficha) return
    const r = await fetch(`/api/admin/clientes/${ficha.vertical}/${encodeURIComponent(ficha.id)}/modulos`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modulo: m.key, activo: !m.activo }),
    })
    if (r.ok) setModulos(ms => ms.map(x => x.key === m.key ? { ...x, activo: !x.activo } : x))
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault(); setNuevoErr('')
    const r = await fetch('/api/admin/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevo) })
    const d = await r.json()
    if (d.ok) { setShowNuevo(false); setNuevo({ vertical: 'ialimp', nombre: '', email: '', password: '', ciudad: '' }); cargar() }
    else setNuevoErr(d.error || 'Error')
  }

  // ── LOGIN ──────────────────────────────────────────────────────────
  if (auth === false) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: C.text }}>
      <form onSubmit={login} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: 36, width: '100%', maxWidth: 380 }}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🎛️ Panel de control</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>Operador de la casa de marcas</div>
        {error && <div style={{ background: C.redBg, color: '#fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>}
        <label style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>EMAIL</label>
        <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" required
          style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card2, color: C.text, fontSize: 14, margin: '6px 0 16px', boxSizing: 'border-box' }} />
        <label style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>CONTRASEÑA</label>
        <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} type="password" required placeholder="••••••••"
          style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card2, color: C.text, fontSize: 14, margin: '6px 0 24px', boxSizing: 'border-box' }} />
        <button type="submit" style={{ width: '100%', padding: 13, background: C.accent, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Entrar →</button>
        <div style={{ marginTop: 14, fontSize: 11, color: C.muted, textAlign: 'center' }}>Tu mismo usuario de superadmin de ialimp.</div>
      </form>
    </div>
  )

  if (auth === null) return <div style={{ minHeight: '100vh', background: C.bg, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>Cargando…</div>

  // ── PANEL ──────────────────────────────────────────────────────────
  const verticales = ['ialimp', 'sivra', 'iarest'] as const
  const activos = clientes.filter(c => c.activo && c.id !== 'iarest-info').length

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 28px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>🎛️ Panel de control <span style={{ color: C.muted, fontWeight: 500, fontSize: 13 }}>· todas las verticales</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => { setNuevoErr(''); setShowNuevo(true) }} style={{ background: C.accent, border: 'none', color: '#fff', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: FONT, fontWeight: 700, fontSize: 13 }}>➕ Nuevo cliente</button>
          <span style={{ fontSize: 13, color: C.muted }}>{operador}</span>
          <button onClick={logout} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: FONT }}>Salir</button>
        </div>
      </div>

      <div style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: `1px solid ${C.border}` }}>
          {([['propiedades', '🏠 Mis propiedades'], ['clientes', '🏢 Negocios'], ['estructura', '🗺️ Estructura']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === k ? C.accent : 'transparent'}`, color: tab === k ? C.text : C.muted, padding: '10px 6px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: FONT }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'propiedades' && <Propiedades />}

        {tab === 'estructura' && <Estructura />}

        {tab === 'clientes' && <>
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <Kpi label="Clientes activos" valor={String(activos)} />
          <Kpi label="Verticales" valor="3" />
          <Kpi label="Total clientes" valor={String(clientes.filter(c => c.id !== 'iarest-info').length)} />
        </div>

        {loading && <div style={{ color: C.muted }}>Cargando clientes…</div>}

        {verticales.map(v => {
          const cs = clientes.filter(c => c.vertical === v)
          return (
            <div key={v} style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>{VERT[v].icon} {VERT[v].label} <span style={{ color: C.muted, fontWeight: 500 }}>· {cs.filter(c => c.id !== 'iarest-info').length}</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cs.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Sin clientes.</div>}
                {cs.map(c => (
                  <div key={c.vertical + c.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 200, flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{c.nombre}</div>
                      <div style={{ display: 'flex', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
                        {c.metricas.map((m, i) => <span key={i} style={{ fontSize: 12, color: C.muted }}>{m.label}: <strong style={{ color: C.text }}>{m.valor}</strong></span>)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {c.id !== 'iarest-info' && (
                        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 10px', background: c.activo ? C.okBg : C.redBg, color: c.activo ? C.ok : '#fca5a5' }}>
                          {c.activo ? '● Activo' : '● Bloqueado'}
                        </span>
                      )}
                      {c.id !== 'iarest-info' && <button onClick={() => ver360(c)} disabled={busy === 'f' + c.vertical + c.id} style={btn(C.border, C.muted)}>360</button>}
                      {c.puedeBloquear && (
                        <button onClick={() => toggle(c)} disabled={busy === c.vertical + c.id}
                          style={btn(c.activo ? C.redBg : C.okBg, c.activo ? '#fca5a5' : C.ok)}>
                          {c.activo ? 'Bloquear' : 'Liberar'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        </>}
      </div>

      {ficha && (
        <div onClick={() => setFicha(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 460, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{ficha.nombre}</div>
              <button onClick={() => setFicha(null)} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>{VERT[ficha.vertical].label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
              {ficha.detalle.map((d, i) => (
                <div key={i} style={{ background: C.card2, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase' }}>{d.label}</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{d.valor}</div>
                </div>
              ))}
            </div>

            {modulos.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Módulos contratados</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {modulos.map(m => (
                    <label key={m.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: C.card2, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
                      <span style={{ fontSize: 13 }}>{m.label}</span>
                      <input type="checkbox" checked={m.activo} onChange={() => toggleModulo(m)} style={{ width: 16, height: 16, accentColor: C.accent, cursor: 'pointer' }} />
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Los cambios aplican en el próximo inicio de sesión del cliente.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {showNuevo && (
        <div onClick={() => setShowNuevo(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form onClick={e => e.stopPropagation()} onSubmit={crear} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 420 }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>➕ Nuevo cliente</div>
            {nuevoErr && <div style={{ background: C.redBg, color: '#fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{nuevoErr}</div>}
            <Field label="Vertical">
              <select value={nuevo.vertical} onChange={e => setNuevo(n => ({ ...n, vertical: e.target.value }))} style={inp}>
                <option value="ialimp">Limpieza · ialimp</option>
                <option value="iarest">Hostelería · ia-rest</option>
              </select>
            </Field>
            <Field label="Nombre"><input value={nuevo.nombre} onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))} required style={inp} /></Field>
            {nuevo.vertical === 'ialimp' && <>
              <Field label="Email del dueño"><input type="email" value={nuevo.email} onChange={e => setNuevo(n => ({ ...n, email: e.target.value }))} required style={inp} /></Field>
              <Field label="Contraseña inicial"><input type="text" value={nuevo.password} onChange={e => setNuevo(n => ({ ...n, password: e.target.value }))} required minLength={8} style={inp} /></Field>
            </>}
            {nuevo.vertical === 'iarest' && <Field label="Ciudad"><input value={nuevo.ciudad} onChange={e => setNuevo(n => ({ ...n, ciudad: e.target.value }))} style={inp} /></Field>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="submit" style={{ flex: 1, padding: 11, background: C.accent, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: FONT }}>Crear</button>
              <button type="button" onClick={() => setShowNuevo(false)} style={{ padding: '11px 16px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, color: C.muted, cursor: 'pointer', fontFamily: FONT }}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ background: '#151b2e', border: '1px solid #2a3457', borderRadius: 12, padding: '14px 20px', minWidth: 130 }}>
      <div style={{ fontSize: 11, color: '#8b97b8', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{valor}</div>
    </div>
  )
}

function btn(bg: string, color: string): React.CSSProperties {
  return { background: bg, color, border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT }
}

function Propiedades() {
  const [props, setProps] = useState<Propiedad[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    fetch('/api/admin/propiedades')
      .then(r => r.json())
      .then(d => setProps(d.propiedades || []))
      .catch(() => setErr('No se pudieron cargar.'))
  }, [])

  if (err) return <div style={{ color: '#fca5a5' }}>{err}</div>
  if (!props) return <div style={{ color: C.muted }}>Cargando propiedades…</div>

  const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
  const totMes = props.reduce((s, p) => s + p.ingresosMes, 0)
  const totGas = props.reduce((s, p) => s + p.gastosMes, 0)

  return (
    <div>
      <p style={{ color: C.muted, fontSize: 13, margin: '0 0 20px', maxWidth: 720 }}>
        Tus apartamentos turísticos (sivra) de un vistazo: ingresos, gastos y próxima reserva.
      </p>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <Kpi label="Apartamentos" valor={String(props.length)} />
        <Kpi label="Ingresos mes" valor={eur(totMes)} />
        <Kpi label="Gastos mes" valor={eur(totGas)} />
        <Kpi label="Resultado mes" valor={eur(totMes - totGas)} />
      </div>
      {props.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Sin propiedades en `properties`.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {props.map(p => (
          <div key={p.id} style={card()}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{p.nombre}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>📍 {p.ubicacion}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
              {[p.dormitorios != null && `${p.dormitorios} hab`, p.camas != null && `${p.camas} camas`, p.banos != null && `${p.banos} baños`, p.maxHuespedes != null && `${p.maxHuespedes} huésp.`].filter(Boolean).join(' · ') || '—'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              <Mini label="Ingresos mes" valor={eur(p.ingresosMes)} />
              <Mini label="Gastos mes" valor={eur(p.gastosMes)} />
              <Mini label="Resultado" valor={eur(p.resultadoMes)} acento={p.resultadoMes >= 0 ? C.ok : '#fca5a5'} />
              <Mini label="Ingresos año" valor={eur(p.ingresosAnio)} />
            </div>
            <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Próxima reserva</div>
              {p.proxima ? (
                <div style={{ fontSize: 12 }}>
                  <strong>{p.proxima.huesped || 'Huésped'}</strong>{p.proxima.portal && <span style={{ color: C.muted }}> · {p.proxima.portal}</span>}
                  <div style={{ color: C.muted, marginTop: 2 }}>{p.proxima.entrada} → {p.proxima.salida}</div>
                </div>
              ) : <div style={{ fontSize: 12, color: C.muted }}>Sin reservas próximas.</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Mini({ label, valor, acento }: { label: string; valor: string; acento?: string }) {
  return (
    <div style={{ background: C.card2, borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 13, color: acento || C.text }}>{valor}</div>
    </div>
  )
}

function Estructura() {
  const cores = MODULOS.filter(m => m.tipo === 'core')
  const mods = MODULOS.filter(m => m.tipo === 'module')
  const sub = { fontSize: 14, fontWeight: 800, margin: '0 0 12px' } as React.CSSProperties
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10, marginBottom: 28 } as React.CSSProperties

  return (
    <div>
      <p style={{ color: C.muted, fontSize: 13, margin: '0 0 24px', maxWidth: 720 }}>
        Mapa de la casa de marcas: la <strong style={{ color: C.text }}>matriz</strong> (común) + <strong style={{ color: C.text }}>verticales</strong> (apps por sector)
        que enchufan <strong style={{ color: C.text }}>módulos compartidos</strong> (packages). Los <strong style={{ color: C.text }}>agentes</strong> son las piezas de IA.
      </p>

      <Radiografia />

      <div style={sub}>🏢 Verticales <span style={{ color: C.muted, fontWeight: 500 }}>· {VERTICALES.length} apps</span></div>
      <div style={grid}>
        {VERTICALES.map(v => (
          <div key={v.app} style={card()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 800 }}>{v.nombre}</span>
              <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>{v.sector}</span>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{v.desc}</div>
            {v.url && <div style={{ fontSize: 11, color: C.muted, marginTop: 6, fontFamily: 'monospace' }}>{v.url}</div>}
            <div style={{ fontSize: 10, color: C.muted, marginTop: 8, opacity: .6 }}>apps/{v.app}</div>
          </div>
        ))}
      </div>

      <div style={sub}>🧩 Núcleos compartidos <span style={{ color: C.muted, fontWeight: 500 }}>· core-* ({cores.length})</span></div>
      <div style={grid}>
        {cores.map(m => (
          <div key={m.id} style={card()}>
            <div style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 13 }}>{m.id}{m.deps && <span title="dep npm propia" style={{ color: C.accent }}> ●</span>}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{m.desc}</div>
          </div>
        ))}
      </div>

      <div style={sub}>📦 Módulos de dominio <span style={{ color: C.muted, fontWeight: 500 }}>· module-* ({mods.length})</span></div>
      <div style={grid}>
        {mods.map(m => (
          <div key={m.id} style={card(C.accent)}>
            <div style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 13 }}>{m.id}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{m.desc}</div>
          </div>
        ))}
      </div>

      <div style={sub}>🤖 Agentes IA <span style={{ color: C.muted, fontWeight: 500 }}>· {AGENTES.length}</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {AGENTES.map((a, i) => (
          <div key={i} style={{ ...card(), display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{a.nombre}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{a.desc}</div>
            </div>
            <span style={{ fontSize: 11, color: C.muted, background: C.card2, borderRadius: 6, padding: '3px 10px', whiteSpace: 'nowrap' }}>{a.ambito}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function card(accent?: string): React.CSSProperties {
  return { background: '#151b2e', border: `1px solid ${accent || '#2a3457'}`, borderRadius: 12, padding: '14px 16px' }
}

// ── Radiografía (auditoría automática del repo) ────────────────────────────────
const VLABEL: Record<string, string> = { 'ia-rest': 'ia.rest', ialimp: 'ialimp', sivra: 'SIVRA', plataforma: 'matriz' }
const vlabel = (v: string) => VLABEL[v] || v

function Radiografia() {
  const R = RADIOGRAFIA
  const fecha = R.generadoEn ? new Date(R.generadoEn).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  const sub = { fontSize: 14, fontWeight: 800, margin: '0 0 12px' } as React.CSSProperties
  const cores = R.packages.filter(p => p.tipo === 'core')
  const mods = R.packages.filter(p => p.tipo === 'module')
  // Agrupar capacidades por su `grupo` conservando el orden del catálogo.
  const grupos: { grupo: string; caps: typeof R.capacidades }[] = []
  for (const c of R.capacidades) {
    let g = grupos.find(x => x.grupo === c.grupo)
    if (!g) { g = { grupo: c.grupo, caps: [] }; grupos.push(g) }
    g.caps.push(c)
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>🩻 Radiografía del repo</div>
        <div style={{ fontSize: 11, color: C.muted }}>Auditoría automática · última: {fecha}</div>
      </div>
      <p style={{ color: C.muted, fontSize: 12, margin: '0 0 14px', maxWidth: 720 }}>
        Auditado contra el código real (no a mano): qué módulo y qué función está implementado en cada vertical.
        Regenerar con <code style={{ background: C.card2, padding: '1px 5px', borderRadius: 4 }}>npm run auditar</code>.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Kpi label="Verticales" valor={String(R.resumen.verticales)} />
        <Kpi label="Packages" valor={String(R.resumen.packages)} />
        <Kpi label="Capacidades" valor={String(R.resumen.capacidades)} />
        <Kpi label="Módulos sin usar" valor={String(R.resumen.modulosInfrautilizados)} />
      </div>

      <div style={sub}>🧩 Módulos por vertical <span style={{ color: C.muted, fontWeight: 500 }}>· quién usa cada package</span></div>
      <Matriz cols={R.verticales}
        secciones={[
          { titulo: 'Núcleos · core-*', filas: cores.map(p => ({ label: p.id, cells: R.verticales.map(v => moduloCell(R.matrizModulos[p.id]?.[v])) })) },
          { titulo: 'Módulos de dominio · module-*', filas: mods.map(p => ({ label: p.id, cells: R.verticales.map(v => moduloCell(R.matrizModulos[p.id]?.[v])) })) },
        ]} />
      <div style={{ fontSize: 11, color: C.muted, margin: '6px 0 24px' }}>
        <Chip c={C.ok} bg={C.okBg}>✓ usado</Chip> importado en código ·{' '}
        <Chip c="#fbbf24" bg="#2a230c">◐ declarado</Chip> en package.json sin import ·{' '}
        <span style={{ color: C.muted }}>· no presente</span>
      </div>

      <div style={sub}>🗂️ Funciones / áreas por vertical <span style={{ color: C.muted, fontWeight: 500 }}>· detectado por rutas</span></div>
      <Matriz cols={R.verticales}
        secciones={grupos.map(g => ({ titulo: g.grupo, filas: g.caps.map(c => ({ label: c.label, cells: R.verticales.map(v => capCell(R.matrizCapacidades[c.id]?.[v])) })) }))} />

      {R.gaps.oportunidadesPortar.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={sub}>↔️ Diferencias entre verticales <span style={{ color: C.muted, fontWeight: 500 }}>· candidatas a portar</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {R.gaps.oportunidadesPortar.map(o => (
              <div key={o.capacidad} style={{ ...card(), display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{o.label}</span>
                <span style={{ fontSize: 12, color: C.muted }}>
                  tiene <strong style={{ color: C.ok }}>{o.tiene.map(vlabel).join(', ')}</strong>
                  {' · '}falta <strong style={{ color: '#fca5a5' }}>{o.falta.map(vlabel).join(', ')}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ height: 1, background: C.border, margin: '28px 0 24px' }} />
    </div>
  )
}

function moduloCell(c?: { estado: 'usado' | 'declarado' | 'no'; evidencias: number }): React.ReactNode {
  if (!c || c.estado === 'no') return <span style={{ color: C.muted, opacity: .4 }} title="no presente">·</span>
  if (c.estado === 'declarado') return <span title="declarado en package.json, sin import" style={{ color: '#fbbf24' }}>◐</span>
  return <span title={`${c.evidencias} fichero(s)`} style={{ color: C.ok }}>✓</span>
}
function capCell(c?: { presente: boolean; evidencias: number }): React.ReactNode {
  if (!c || !c.presente) return <span style={{ color: C.muted, opacity: .4 }} title="no detectado">·</span>
  return <span title={`${c.evidencias} ruta(s)`} style={{ color: C.ok }}>✓</span>
}

function Chip({ children, c, bg }: { children: React.ReactNode; c: string; bg: string }) {
  return <span style={{ color: c, background: bg, borderRadius: 5, padding: '1px 6px', fontWeight: 700 }}>{children}</span>
}

type Fila = { label: string; cells: React.ReactNode[] }
type Seccion = { titulo: string; filas: Fila[] }
function Matriz({ cols, secciones }: { cols: string[]; secciones: Seccion[] }) {
  const th: React.CSSProperties = { textAlign: 'center', padding: '7px 8px', fontSize: 11, color: C.muted, fontWeight: 700, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { textAlign: 'center', padding: '6px 8px', fontSize: 14, borderTop: `1px solid ${C.border}` }
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 12, background: C.card }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 360 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', paddingLeft: 14 }}></th>
            {cols.map(v => <th key={v} style={th}>{vlabel(v)}</th>)}
          </tr>
        </thead>
        <tbody>
          {secciones.map(s => (
            <Fragment key={s.titulo}>
              <tr><td colSpan={cols.length + 1} style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 800, color: C.accent, textTransform: 'uppercase', letterSpacing: .4, borderTop: `1px solid ${C.border}` }}>{s.titulo}</td></tr>
              {s.filas.map(f => (
                <tr key={f.label}>
                  <td style={{ ...td, textAlign: 'left', paddingLeft: 14, fontSize: 12.5, fontFamily: /^(core|module)-/.test(f.label) ? 'monospace' : 'inherit', color: C.text }}>{f.label}</td>
                  {f.cells.map((cell, i) => <td key={i} style={td}>{cell}</td>)}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #2a3457', background: '#1c2540', color: '#e8ecf7', fontSize: 14, fontFamily: FONT, boxSizing: 'border-box' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, color: '#8b97b8', fontWeight: 700, display: 'block', marginBottom: 5 }}>{label}</label>{children}</div>
}
