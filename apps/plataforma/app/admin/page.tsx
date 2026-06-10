// Panel de OPERADOR (god-panel) — un solo sitio para gobernar todas las verticales.
// Auth propia (cookie plataforma_admin); muestra login si no hay sesión de operador.
'use client'
import { useEffect, useState, useCallback } from 'react'

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
