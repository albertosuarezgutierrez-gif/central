// Panel de OPERADOR (god-panel) — un solo sitio para gobernar todas las verticales.
// Auth propia (cookie plataforma_admin); muestra login si no hay sesión de operador.
'use client'
import { useEffect, useState, useCallback } from 'react'
import { VERTICALES, MODULOS, AGENTES } from '@/lib/estructura'

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
  const [tab, setTab] = useState<'clientes' | 'estructura'>('clientes')

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
    setFicha(null); setBusy('f' + c.vertical + c.id)
    const r = await fetch(`/api/admin/clientes/${c.vertical}/${encodeURIComponent(c.id)}`)
    if (r.ok) { const d = await r.json(); setFicha(d.ficha) }
    setBusy(null)
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: C.muted }}>{operador}</span>
          <button onClick={logout} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: FONT }}>Salir</button>
        </div>
      </div>

      <div style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: `1px solid ${C.border}` }}>
          {([['clientes', '👥 Clientes'], ['estructura', '🗺️ Estructura']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === k ? C.accent : 'transparent'}`, color: tab === k ? C.text : C.muted, padding: '10px 6px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: FONT }}>
              {label}
            </button>
          ))}
        </div>

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
          </div>
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
