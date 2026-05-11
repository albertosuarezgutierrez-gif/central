'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth, Session } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import SugerenciasPanel from '@/components/SugerenciasPanel'
import SystemHealth from '@/components/SystemHealth'

const C = {
  bg: '#F6F1E7', bg2: '#EFE7D6', bg3: '#E5DAC2', ink: '#1A1714',
  ink2: '#3A332C', ink3: '#6B5F52', ink4: '#9A8D7C',
  rule: '#D8CDB6', ruleS: '#B8A98B',
  red: '#D9442B', redD: '#A8311E', redS: '#F4D8CF',
  green: '#3F7D44', greenS: '#D4E4D2',
  dark: '#14110E', dark2: '#1F1A15',
}
const SE = "'Newsreader',Georgia,serif"
const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

interface Restaurante {
  id: string
  nombre: string
  slug: string
  codigo_acceso: string
  plan: string
  plan_status: string | null
  activo: boolean
  ciudad: string
  created_at: string
  trial_end: string | null
  max_camareros: number | null
  stripe_subscription_id: string | null
  camareros: [{ count: number }]
  mesas: [{ count: number }]
  comandas: [{ count: number }]
}

interface CuentaVista {
  cuenta_id: string
  cuenta_nombre: string
  email: string | null
  telefono: string | null
  estado: string
  plan: string | null
  plan_status: string | null
  num_restaurantes: number
  restaurantes: { id: string; nombre: string; plan: string; plan_status: string; activo: boolean; ciudad: string }[]
  created_at: string
}

const PLAN_COLOR: Record<string, string> = {
  starter: C.ink3,
  pro: C.red,
  enterprise: C.green,
}

export default function SuperPage() {
  const { session, checking } = useAuth(['super_admin'] as any)
  const router = useRouter()
  const [trainingStats, setTrainingStats] = useState<any>(null)
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', slug: '', codigo_acceso: '', plan: 'starter', ciudad: 'Madrid' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [tabSuper, setTabSuper] = useState<'restaurantes'|'clientes'|'leads'|'sugerencias'|'ia_training'|'sistema'|'cobro'>('restaurantes')
  const [sugerencias, setSugerencias] = useState<any[]>([])
  const [loadingSug, setLoadingSug] = useState(false)
  const [filtroSug, setFiltroSug] = useState<string>('todas')
  const [badgeSug, setBadgeSug] = useState(0)
  const [cuentas, setCuentas] = useState<CuentaVista[]>([])
  const [loadingCuentas, setLoadingCuentas] = useState(false)
  const [showFormCuenta, setShowFormCuenta] = useState(false)
  const [formCuenta, setFormCuenta] = useState({ nombre:'', email:'', telefono:'', pin_cuenta:'', nif:'', razon_social:'', notas_super:'' })
  const [savingCuenta, setSavingCuenta] = useState(false)
  const [errCuenta, setErrCuenta] = useState('')

  const loadSugerencias = useCallback(async () => {
    if (!session) return
    setLoadingSug(true)
    const r = await fetch('/api/sugerencias', {
      headers: { 'x-ia-session': JSON.stringify(session) }
    })
    const d = await r.json()
    const lista = d.sugerencias ?? []
    setSugerencias(lista)
    setBadgeSug(lista.filter((s: any) => !s.leida).length)
    setLoadingSug(false)
  }, [session])

  const marcarLeida = async (id: string) => {
    setSugerencias(prev => prev.map(s => s.id === id ? { ...s, leida: true } : s))
    setBadgeSug(prev => Math.max(0, prev - 1))
    await fetch('/api/sugerencias', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify({ id, leida: true }),
    })
  }

  const cambiarEstado = async (id: string, estado: string) => {
    setSugerencias(prev => prev.map(s => s.id === id ? { ...s, estado } : s))
    await fetch('/api/sugerencias', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify({ id, estado }),
    })
  }

  useEffect(() => { if (session && tabSuper === 'sugerencias') loadSugerencias() }, [session, tabSuper, loadSugerencias])
  useEffect(() => { if (session && tabSuper === 'clientes') loadCuentas() }, [session, tabSuper])
  useEffect(() => { if (session && tabSuper === 'ia_training') {
    fetch('/api/super/training-stats', { headers: { 'x-ia-session': JSON.stringify(session) } })
      .then(r => r.json()).then(d => setTrainingStats(d))
  }}, [session, tabSuper])

    useEffect(() => { if (session) { 
    fetch('/api/sugerencias', { headers: { 'x-ia-session': JSON.stringify(session) } })
      .then(r => r.json()).then(d => setBadgeSug((d.sugerencias ?? []).filter((s: any) => !s.leida).length))
  }}, [session])

  const loadCuentas = async () => {
    if (!session) return
    setLoadingCuentas(true)
    const r = await fetch('/api/super/cuentas', { headers: { 'x-ia-session': JSON.stringify(session) } })
    const d = await r.json()
    setCuentas(d.cuentas ?? [])
    setLoadingCuentas(false)
  }

  const crearCuenta = async () => {
    if (!formCuenta.nombre.trim() || !formCuenta.pin_cuenta.trim()) {
      setErrCuenta('Nombre y PIN son obligatorios')
      return
    }
    setSavingCuenta(true); setErrCuenta('')
    const r = await fetch('/api/super/cuentas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify(formCuenta),
    })
    const d = await r.json()
    setSavingCuenta(false)
    if (!r.ok) { setErrCuenta(d.error || 'Error'); return }
    setShowFormCuenta(false)
    setFormCuenta({ nombre:'', email:'', telefono:'', pin_cuenta:'', nif:'', razon_social:'', notas_super:'' })
    await loadCuentas()
  }

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    const r = await fetch('/api/super/restaurantes', {
      headers: { 'x-ia-session': JSON.stringify(session) }
    })
    const d = await r.json()
    setRestaurantes(d.restaurantes ?? [])
    setLoading(false)
  }, [session])

  useEffect(() => { if (session) load() }, [session, load])

  const crear = async () => {
    if (!form.nombre || !form.slug || !form.codigo_acceso) {
      setErr('Nombre, slug y código son obligatorios')
      return
    }
    setSaving(true)
    setErr('')
    const r = await fetch('/api/super/restaurantes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify(form),
    })
    const d = await r.json()
    if (d.error) { setErr(d.error); setSaving(false); return }
    setShowForm(false)
    setForm({ nombre: '', slug: '', codigo_acceso: '', plan: 'starter', ciudad: 'Madrid' })
    setSaving(false)
    load()
  }

  const toggleActivo = async (r: Restaurante) => {
    await fetch('/api/super/restaurantes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify({ id: r.id, activo: !r.activo }),
    })
    load()
  }

  if (checking) return null

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SN }}>
      <style>{`
        .super-rest-row {
          display: grid;
          grid-template-columns: 1fr auto auto auto auto;
          align-items: center;
          gap: 24px;
        }
        .super-rest-actions { display: flex; align-items: center; gap: 8px; }
        .super-header-name { display: block; }
        @media (max-width: 768px) {
          .super-rest-row {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .super-rest-actions {
            flex-wrap: wrap;
            gap: 6px;
          }
          .super-form-grid { grid-template-columns: 1fr !important; }
          .super-header { padding: 0 16px !important; }
          .super-content { padding: clamp(16px,4vw,32px) clamp(12px,4vw,24px) !important; }
        }
        @media (max-width: 480px) {
          .super-header-name { display: none; }
        }
      `}</style>
      {/* Header */}
      <header className="super-header" style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: C.dark, borderBottom: `1px solid #2F2820`,
        padding: '0 32px', height: 56,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ fontFamily: SE, fontSize: 20, color: '#F6F1E7', fontWeight: 500 }}>
          ia<span style={{ color: C.red }}>.</span>rest
        </div>
        <div style={{ fontFamily: SM, fontSize: 10, color: '#8D8270', letterSpacing: '.1em' }}>
          SUPER ADMIN
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="super-header-name" style={{ fontFamily: SM, fontSize: 11, color: '#8D8270' }}>
            {session?.nombre}
          </div>
          <button
            onClick={() => { localStorage.removeItem('ia_rest_session'); window.location.href = '/login' }}
            style={{
              background: 'none', border: `1px solid #2F2820`, borderRadius: 4,
              color: '#8D8270', fontFamily: SM, fontSize: 10, padding: '4px 10px',
              cursor: 'pointer', letterSpacing: '.08em',
            }}
          >
            SALIR
          </button>
        </div>
      </header>

      {/* TABS NAV */}
      <div style={{ borderBottom: `1px solid ${C.rule}`, background: C.bg }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(12px, 4vw, 32px)', display: 'flex', gap: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {([
            { id: 'restaurantes', label: 'Restaurantes' },
            { id: 'clientes',     label: 'Clientes' },
            { id: 'leads',        label: 'Leads' },
            { id: 'cobro',        label: 'Cobro €' },
            { id: 'sugerencias',  label: 'Sugerencias', badge: badgeSug },
            { id: 'ia_training',  label: 'IA Training' },
            { id: 'sistema',      label: 'Sistema' },
          ] as any[]).map((t: any) => (
            <button key={t.id} onClick={() => setTabSuper(t.id as any)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '14px 20px',
                fontFamily: SM, fontSize: 11, letterSpacing: '.1em',
                color: tabSuper === t.id ? C.ink : C.ink4,
                borderBottom: `2px solid ${tabSuper === t.id ? C.red : 'transparent'}`,
                position: 'relative',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'color .15s',
              }}
            >
              {t.label.toUpperCase()}
              {'badge' in t && (t as any).badge > 0 && (
                <span style={{
                  background: C.red, color: '#fff',
                  borderRadius: 10, fontSize: 9, fontWeight: 700,
                  padding: '1px 5px', lineHeight: '14px',
                  fontFamily: SM,
                }}>
                  {(t as any).badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: `clamp(24px, 5vw, 48px) clamp(12px, 4vw, 32px)` }}>
        {tabSuper === 'cobro' ? (
          <Cobro session={session} C={C} SE={SE} SN={SN} SM={SM} />
        ) : tabSuper === 'leads' ? (
          <LeadsTab C={C} SE={SE} SN={SN} SM={SM} />
        ) : tabSuper === 'sugerencias' ? (
          <SugerenciasPanel
            sugerencias={sugerencias}
            loading={loadingSug}
            filtro={filtroSug}
            setFiltro={setFiltroSug}
            onMarcarLeida={marcarLeida}
            onCambiarEstado={cambiarEstado}
            onRecargar={loadSugerencias}
          />
        ) : tabSuper === 'clientes' ? (
          <div>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em', marginBottom: 8 }}>CLIENTES · MULTI-RESTAURANTE</div>
              <h1 style={{ fontFamily: SE, fontSize: 40, fontWeight: 500, margin: '0 0 8px', color: C.ink }}>Clientes</h1>
              <p style={{ fontFamily: SN, fontSize: 14, color: C.ink3, margin: 0 }}>
                Cada cliente puede tener uno o varios restaurantes. Un PIN de cuenta, múltiples locales.
              </p>
            </div>

            {/* Botón nueva cuenta */}
            {!showFormCuenta && (
              <button onClick={() => setShowFormCuenta(true)}
                style={{ marginBottom: 24, padding: '10px 20px', background: C.red, border: 'none', borderRadius: 4, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                + Nueva cuenta de cliente
              </button>
            )}

            {/* Formulario nueva cuenta */}
            {showFormCuenta && (
              <div style={{ background: '#fff', border: `1px solid ${C.rule}`, borderRadius: 8, padding: 24, marginBottom: 24 }}>
                <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.1em', marginBottom: 16 }}>NUEVA CUENTA</div>
                <div className="super-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {[
                    { k: 'nombre',       l: 'Nombre *',         ph: 'Manuela García' },
                    { k: 'pin_cuenta',   l: 'PIN de cuenta *',  ph: '2026', type: 'text' },
                    { k: 'email',        l: 'Email',            ph: 'manuela@gmail.com' },
                    { k: 'telefono',     l: 'Teléfono',         ph: '+34 600 000 000' },
                    { k: 'nif',          l: 'NIF',              ph: 'B12345678' },
                    { k: 'razon_social', l: 'Razón social',     ph: 'Hostelería SL' },
                  ].map(f => (
                    <div key={f.k}>
                      <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 4 }}>{f.l}</div>
                      <input
                        value={formCuenta[f.k as keyof typeof formCuenta]}
                        onChange={e => setFormCuenta(fc => ({ ...fc, [f.k]: e.target.value }))}
                        placeholder={f.ph}
                        style={{ width: '100%', padding: '8px 10px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 4, fontFamily: SN, fontSize: 13, color: C.ink, outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 4 }}>Notas internas</div>
                  <textarea
                    value={formCuenta.notas_super}
                    onChange={e => setFormCuenta(fc => ({ ...fc, notas_super: e.target.value }))}
                    placeholder="Solo visible para super admin"
                    rows={2}
                    style={{ width: '100%', padding: '8px 10px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 4, fontFamily: SN, fontSize: 13, color: C.ink, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>
                {errCuenta && <div style={{ fontFamily: SM, fontSize: 11, color: C.red, marginBottom: 8 }}>{errCuenta}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={crearCuenta} disabled={savingCuenta}
                    style={{ padding: '8px 20px', background: C.red, border: 'none', borderRadius: 4, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {savingCuenta ? 'Guardando...' : 'Crear cuenta'}
                  </button>
                  <button onClick={() => { setShowFormCuenta(false); setErrCuenta('') }}
                    style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 4, fontFamily: SN, fontSize: 13, color: C.ink3, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Lista cuentas */}
            {loadingCuentas ? (
              <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>Cargando...</div>
            ) : cuentas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', background: C.bg, borderRadius: 8, border: `1px dashed ${C.rule}` }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
                <div style={{ fontFamily: SE, fontSize: 20, color: C.ink, marginBottom: 6 }}>Sin cuentas todavía</div>
                <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Crea la primera cuenta de cliente</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {cuentas.map(c => (
                  <div key={c.cuenta_id} style={{ background: '#fff', border: `1px solid ${C.rule}`, borderRadius: 8, padding: 20, display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <div style={{ fontFamily: SE, fontSize: 20, color: C.ink }}>{c.cuenta_nombre}</div>
                        <span style={{ fontFamily: SM, fontSize: 9, padding: '2px 7px', borderRadius: 3, background: c.estado === 'activo' ? C.greenS : C.redS, color: c.estado === 'activo' ? C.green : C.red, letterSpacing: '.08em' }}>
                          {c.estado.toUpperCase()}
                        </span>
                        <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>
                          {c.num_restaurantes} local{c.num_restaurantes !== 1 ? 'es' : ''}
                        </span>
                      </div>
                      {c.email && <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginBottom: 4 }}>{c.email}</div>}
                      {/* Restaurantes de la cuenta */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {(c.restaurantes || []).map((r: any) => (
                          <span key={r.id} style={{ fontFamily: SM, fontSize: 10, padding: '3px 8px', borderRadius: 3, background: C.bg, border: `1px solid ${C.rule}`, color: C.ink2 }}>
                            {r.nombre} · {r.plan}
                          </span>
                        ))}
                        {c.num_restaurantes === 0 && (
                          <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, fontStyle: 'italic' }}>Sin restaurantes asignados</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
                      {new Date(c.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
        <div>
        {/* Title */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em', marginBottom: 8 }}>
            PANEL · SUPER ADMIN
          </div>
          <h1 style={{ fontFamily: SE, fontSize: 48, fontWeight: 500, margin: '0 0 8px', letterSpacing: '-.02em', color: C.ink }}>
            Restaurantes
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontFamily: SN, fontSize: 15, color: C.ink3 }}>
              {restaurantes.length} restaurante{restaurantes.length !== 1 ? 's' : ''} activos
            </div>
            <button
              onClick={() => setShowForm(true)}
              style={{
                background: C.ink, color: C.bg, border: 'none', borderRadius: 4,
                fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '8px 16px',
                cursor: 'pointer', marginLeft: 'auto',
              }}
            >
              Nuevo restaurante
            </button>
          </div>
        </div>

        {/* Form nueva alta */}
        {showForm && (
          <div style={{
            background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 8,
            padding: '28px', marginBottom: 32,
          }}>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, letterSpacing: '.1em', marginBottom: 20 }}>
              NUEVO RESTAURANTE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 16 }}>
              {[
                { key: 'nombre', label: 'Nombre', placeholder: 'Bodega La Plaza' },
                { key: 'slug', label: 'Slug (subdominio)', placeholder: 'bodega-laplaza' },
                { key: 'codigo_acceso', label: 'Código acceso', placeholder: 'BODEGA' },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.08em', marginBottom: 6 }}>
                    {f.label.toUpperCase()}
                  </div>
                  <input
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{
                      width: '100%', padding: '10px 12px',
                      background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 4,
                      fontFamily: SN, fontSize: 14, color: C.ink, outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.08em', marginBottom: 6 }}>PLAN</div>
                <select
                  value={form.plan}
                  onChange={e => setForm(p => ({ ...p, plan: e.target.value }))}
                  style={{
                    width: '100%', padding: '10px 12px',
                    background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 4,
                    fontFamily: SN, fontSize: 14, color: C.ink, outline: 'none',
                  }}
                >
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.08em', marginBottom: 6 }}>CIUDAD</div>
                <input
                  value={form.ciudad}
                  onChange={e => setForm(p => ({ ...p, ciudad: e.target.value }))}
                  placeholder="Madrid"
                  style={{
                    width: '100%', padding: '10px 12px',
                    background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 4,
                    fontFamily: SN, fontSize: 14, color: C.ink, outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
            {err && (
              <div style={{ fontFamily: SN, fontSize: 13, color: C.red, marginBottom: 12 }}>{err}</div>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={crear}
                disabled={saving}
                style={{
                  background: C.red, color: '#F6F1E7', border: 'none', borderRadius: 4,
                  fontFamily: SN, fontSize: 14, fontWeight: 600, padding: '10px 20px',
                  cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Creando...' : 'Crear restaurante'}
              </button>
              <button
                onClick={() => { setShowForm(false); setErr('') }}
                style={{
                  background: 'none', border: `1px solid ${C.rule}`, borderRadius: 4,
                  fontFamily: SN, fontSize: 14, color: C.ink3, padding: '10px 20px',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista restaurantes */}
        {loading ? (
          <div style={{ fontFamily: SM, fontSize: 12, color: C.ink4, letterSpacing: '.1em' }}>
            CARGANDO...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {restaurantes.map(r => (
              <div key={r.id} className="super-rest-row" style={{
                background: r.activo ? C.bg : C.bg2, border: `1px solid ${C.rule}`, borderRadius: 8,
                padding: '20px 24px',
                opacity: r.activo ? 1 : 0.6,
              }}>
                {/* Info */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <div style={{ fontFamily: SN, fontSize: 18, fontWeight: 600, color: C.ink }}>{r.nombre}</div>
                    <span style={{
                      fontFamily: SM, fontSize: 9, fontWeight: 700,
                      padding: '2px 7px', borderRadius: 3,
                      background: r.activo ? C.greenS : C.bg3,
                      color: r.activo ? C.green : C.ink4,
                      letterSpacing: '.08em',
                    }}>
                      {r.activo ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                    <span style={{
                      fontFamily: SM, fontSize: 9, fontWeight: 700,
                      padding: '2px 7px', borderRadius: 3,
                      background: C.bg3, color: PLAN_COLOR[r.plan] ?? C.ink3,
                      letterSpacing: '.08em',
                    }}>
                      {r.plan.toUpperCase()}
                    </span>
                    {r.plan_status && (
                      <span style={{
                        fontFamily: SM, fontSize: 9, fontWeight: 700,
                        padding: '2px 7px', borderRadius: 3, letterSpacing: '.08em',
                        background: r.plan_status === 'active' ? 'rgba(63,125,68,.15)' : r.plan_status === 'trial' ? 'rgba(232,163,59,.15)' : 'rgba(217,68,43,.12)',
                        color: r.plan_status === 'active' ? '#3F7D44' : r.plan_status === 'trial' ? '#A8761A' : '#D9442B',
                      }}>
                        {r.plan_status === 'trial'
                          ? `TRIAL · ${r.trial_end ? Math.max(0, Math.ceil((new Date(r.trial_end).getTime() - Date.now()) / 86400000)) + 'd' : '?'}`
                          : r.plan_status.toUpperCase()}
                      </span>
                    )}
                    {r.max_camareros && r.max_camareros < 999 && (
                      <span style={{ fontFamily: SM, fontSize: 9, color: C.ink4, padding: '2px 6px', background: C.bg3, borderRadius: 3 }}>
                        {r.max_camareros}u
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, letterSpacing: '.06em' }}>
                    {r.slug}.ia.rest &nbsp;·&nbsp; {r.codigo_acceso} &nbsp;·&nbsp; {r.ciudad}
                  </div>
                </div>

                {/* Metrics */}
                {[
                  { v: r.camareros?.[0]?.count ?? 0, l: 'camareros' },
                  { v: r.mesas?.[0]?.count ?? 0, l: 'mesas' },
                  { v: r.comandas?.[0]?.count ?? 0, l: 'comandas' },
                ].map(m => (
                  <div key={m.l} style={{ textAlign: 'center', minWidth: 60 }}>
                    <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: C.ink, lineHeight: 1 }}>{m.v}</div>
                    <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.08em', marginTop: 2 }}>{m.l.toUpperCase()}</div>
                  </div>
                ))}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => router.push(`/super/${r.id}`)}
                    style={{
                      background: C.red, border: 'none', borderRadius: 4,
                      fontFamily: SM, fontSize: 10, color: '#fff', padding: '6px 12px',
                      cursor: 'pointer', letterSpacing: '.06em',
                    }}
                  >
                    GESTIONAR →
                  </button>
                  <button
                    onClick={() => toggleActivo(r)}
                    style={{
                      background: 'none', border: `1px solid ${r.activo ? C.rule : C.ruleS}`, borderRadius: 4,
                      fontFamily: SM, fontSize: 10,
                      color: r.activo ? C.red : C.green,
                      padding: '6px 10px', cursor: 'pointer', letterSpacing: '.06em',
                    }}
                  >
                    {r.activo ? 'PAUSAR' : 'ACTIVAR'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}


        {/* IA TRAINING TAB */}
        {tabSuper === 'ia_training' && (
          <div>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em', marginBottom: 8 }}>IA TRAINING · FINE-TUNING PROPIO</div>
              <h1 style={{ fontFamily: SE, fontSize: 40, fontWeight: 500, margin: '0 0 8px', color: C.ink }}>IA Training</h1>
              <p style={{ fontFamily: SN, fontSize: 15, color: C.ink3, margin: 0 }}>
                Pares EAR→BRAIN acumulados para el futuro modelo propio. Activar fine-tuning a partir de ~50 clientes.
              </p>
            </div>
            {!trainingStats ? (
              <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>Cargando estadísticas…</div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
                  {[
                    { l: 'Total pares', v: trainingStats.total ?? 0 },
                    { l: 'Restaurantes activos', v: trainingStats.restaurantes ?? 0 },
                    { l: 'Hoy', v: trainingStats.hoy ?? 0 },
                    { l: 'Esta semana', v: trainingStats.semana ?? 0 },
                  ].map(m => (
                    <div key={m.l} style={{ background: C.bg2, borderRadius: 8, padding: '20px 24px', border: `1px solid ${C.rule}` }}>
                      <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.1em', marginBottom: 8 }}>{m.l.toUpperCase()}</div>
                      <div style={{ fontFamily: SE, fontSize: 40, fontWeight: 500, color: C.red, lineHeight: 1 }}>{m.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: C.bg2, borderRadius: 8, padding: 24, border: `1px solid ${C.rule}`, marginBottom: 24 }}>
                  <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.1em', marginBottom: 16 }}>ESTADO DEL PIPELINE DE ENTRENAMIENTO</div>
                  {[
                    ['Trigger activo', 'trg_transcripcion_to_training_log — copia cada par EAR/BRAIN automáticamente', true],
                    ['Tabla', 'ia_training_log — índices + RLS + vista v_training_stats', true],
                    ['Umbral fine-tuning', '~50 clientes / ~100.000 pares mínimo recomendado', false],
                    ['Modelo objetivo', 'Claude fine-tuned o modelo propio vía API Anthropic', false],
                  ].map(([k, v, ok]) => (
                    <div key={k as string} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: `1px solid ${C.rule}`, alignItems: 'flex-start' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? C.green : C.ink4, display: 'inline-block', marginTop: 5, flexShrink: 0 }} />
                      <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3, width: 180, flexShrink: 0 }}>{k as string}</span>
                      <span style={{ fontFamily: SN, fontSize: 13, color: C.ink2 }}>{v as string}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tabSuper === 'sistema' && (
          <div style={{ padding: '24px 0' }}>
            <SystemHealth session={session} />
          </div>
        )}

        {/* Footer info */}
        <div style={{
          marginTop: 64, paddingTop: 24, borderTop: `1px solid ${C.rule}`,
          fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.1em',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>ia.rest · Multi-tenant</span>
          <span>Supabase: efncqyvhniaxsirhdxaa</span>
        </div>
        </div>
        )}
      </div>
    </div>
  )
}

// ── Panel financiero ia.rest cobro (super admin) ──────────────
function Cobro({ session, C, SE, SN, SM }: { session: any; C: any; SE: string; SN: string; SM: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    const token = typeof window !== 'undefined' ? localStorage.getItem('ia_rest_session') : null
    fetch('/api/super/cobro-resumen', { headers: { 'x-session-token': token || '' } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [session])

  const fmt = (n: number) => (n || 0).toFixed(2).replace('.', ',') + ' €'
  const fmtK = (n: number) => n >= 1000 ? ((n/1000).toFixed(1) + 'k €') : fmt(n)

  if (loading) return <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3, padding: 32 }}>CARGANDO...</div>
  if (!data) return <div style={{ fontFamily: SM, fontSize: 12, color: C.red, padding: 32 }}>Error al cargar datos</div>

  const { totales, restaurantes, historico } = data
  const mesActual = new Date().toLocaleString('es', { month: 'long', year: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: C.ink, fontStyle: 'italic', marginBottom: 4 }}>ia.rest cobro</div>
        <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Panel financiero · Comisiones QR de la plataforma</div>
      </div>

      {/* KPIs globales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 36 }}>
        {[
          { label: 'Volumen mes', value: fmtK(totales.volumen_mes), sub: mesActual, color: C.ink },
          { label: 'Comisión mes', value: fmt(totales.comision_mes), sub: '0,5% de ' + fmtK(totales.volumen_mes), color: C.green },
          { label: 'Volumen año', value: fmtK(totales.volumen_anio), sub: new Date().getFullYear().toString(), color: C.ink },
          { label: 'Comisión año', value: fmt(totales.comision_anio), sub: 'acumulado ' + new Date().getFullYear(), color: C.green },
          { label: 'Transacciones', value: (totales.txn_mes || 0).toString(), sub: 'este mes', color: C.blue },
        ].map((kpi, i) => (
          <div key={i} style={{ background: C.dark2, borderRadius: 14, padding: '18px 20px', border: `1px solid ${C.rule}` }}>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.08em', marginBottom: 8 }}>{kpi.label.toUpperCase()}</div>
            <div style={{ fontFamily: SE, fontSize: 26, fontWeight: 700, fontStyle: 'italic', color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 4 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabla por restaurante */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.1em', marginBottom: 14 }}>RESTAURANTES · MES ACTUAL</div>
        <div style={{ background: C.dark2, borderRadius: 14, border: `1px solid ${C.rule}`, overflow: 'hidden' }}>
          {/* Header tabla */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px 90px 80px 90px', gap: 0, padding: '10px 20px', borderBottom: `1px solid ${C.rule}` }}>
            {['Restaurante', 'Ciudad', 'Volumen', 'Comisión', 'Txn', 'Descuento'].map(h => (
              <div key={h} style={{ fontFamily: SM, fontSize: 9, color: C.ink3, letterSpacing: '.08em' }}>{h.toUpperCase()}</div>
            ))}
          </div>
          {(restaurantes || []).length === 0 && (
            <div style={{ padding: '24px 20px', fontFamily: SN, fontSize: 13, color: C.ink3 }}>Sin cobros QR registrados este mes</div>
          )}
          {(restaurantes || []).map((r: any, i: number) => (
            <div key={r.restaurante_id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px 90px 80px 90px', gap: 0, padding: '12px 20px', borderBottom: i < restaurantes.length - 1 ? `1px solid ${C.rule}` : 'none', background: i % 2 === 0 ? 'transparent' : C.dark }}>
              <div>
                <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{r.restaurante_nombre}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                  <span style={{ fontFamily: SM, fontSize: 9, color: C.ink3 }}>{r.codigo_acceso}</span>
                  {r.ia_cobro_activo && <span style={{ fontFamily: SM, fontSize: 9, color: C.green, background: C.greenS, borderRadius: 10, padding: '1px 6px' }}>COBRO ON</span>}
                  <span style={{ fontFamily: SM, fontSize: 9, color: C.ink3, background: C.dark2, borderRadius: 10, padding: '1px 6px' }}>{r.modo_cobro}</span>
                </div>
              </div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink2, paddingTop: 2 }}>{r.ciudad || '—'}</div>
              <div style={{ fontFamily: SM, fontSize: 13, color: r.volumen_mes_actual > 0 ? C.ink : C.ink4 }}>{fmtK(r.volumen_mes_actual)}</div>
              <div style={{ fontFamily: SM, fontSize: 13, color: r.comision_mes_actual > 0 ? C.green : C.ink4 }}>{fmt(r.comision_mes_actual)}</div>
              <div style={{ fontFamily: SM, fontSize: 13, color: C.ink2 }}>{r.txn_mes_actual || '—'}</div>
              <div style={{ fontFamily: SM, fontSize: 13, color: r.descuento_mes_actual > 0 ? C.amber : C.ink4 }}>
                {r.descuento_mes_actual > 0 ? `-${r.descuento_mes_actual}€` : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico global últimos 12 meses */}
      {historico && historico.length > 0 && (
        <div>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.1em', marginBottom: 14 }}>HISTÓRICO · PLATAFORMA COMPLETA</div>
          <div style={{ background: C.dark2, borderRadius: 14, border: `1px solid ${C.rule}`, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 100px 80px', padding: '10px 20px', borderBottom: `1px solid ${C.rule}` }}>
              {['Mes', 'Volumen', 'Comisión', 'Txn'].map(h => (
                <div key={h} style={{ fontFamily: SM, fontSize: 9, color: C.ink3, letterSpacing: '.08em' }}>{h.toUpperCase()}</div>
              ))}
            </div>
            {historico.map((h: any, i: number) => {
              const d = new Date(h.mes + 'T12:00:00Z')
              const label = d.toLocaleString('es', { month: 'long', year: 'numeric' })
              return (
                <div key={h.mes} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 100px 80px', padding: '11px 20px', borderBottom: i < historico.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
                  <div style={{ fontFamily: SN, fontSize: 12, color: C.ink2, textTransform: 'capitalize' }}>{label}</div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ height: 6, borderRadius: 3, background: C.red, width: `${Math.min(100, (h.volumen / (historico[0]?.volumen || 1)) * 100)}%`, minWidth: 4, maxWidth: 160 }} />
                      <span style={{ fontFamily: SM, fontSize: 12, color: C.ink }}>{fmtK(h.volumen)}</span>
                    </div>
                  </div>
                  <div style={{ fontFamily: SM, fontSize: 12, color: C.green }}>{fmt(h.comision)}</div>
                  <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>{h.txn || '—'}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Tab: Leads (super_admin) ─── */
const ESTADOS_LEAD = ['nuevo','contactado','demo','cliente','descartado'] as const
type EstadoLead = typeof ESTADOS_LEAD[number]
const ESTADO_COLOR: Record<EstadoLead, string> = {
  nuevo:       '#E8A33B',
  contactado:  '#3B8BE8',
  demo:        '#7B5EA7',
  cliente:     '#3F7D44',
  descartado:  '#6B5F52',
}
interface Lead { id: string; nombre: string; restaurante: string; telefono: string; email?: string; estado: EstadoLead; notas: string | null; created_at: string }

function LeadsTab({ C, SN, SM }: { C: any; SE: string; SN: string; SM: string }) {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '', 'Content-Type': 'application/json' })
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/super/leads', { headers: sh() })
      .then(r => r.json())
      .then(d => setLeads(d.leads || []))
      .finally(() => setLoading(false))
  }, [])

  const cambiarEstado = async (lead: Lead) => {
    const idx = ESTADOS_LEAD.indexOf(lead.estado)
    const next = ESTADOS_LEAD[(idx + 1) % ESTADOS_LEAD.length]
    const r = await fetch(`/api/super/leads/${lead.id}`, { method: 'PATCH', headers: sh(), body: JSON.stringify({ estado: next }) })
    const d = await r.json()
    if (d.lead) setLeads(prev => prev.map(l => l.id === lead.id ? d.lead : l))
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em', marginBottom: 8 }}>COMERCIAL</div>
        <h1 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 40, fontWeight: 500, margin: '0 0 8px', color: C.ink }}>Leads</h1>
        <p style={{ fontFamily: SN, fontSize: 14, color: C.ink3, margin: 0 }}>
          Contactos del formulario de la landing. {leads.length} recibido{leads.length !== 1 ? 's' : ''}.
        </p>
      </div>

      {/* Leyenda estados */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {ESTADOS_LEAD.map(e => (
          <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: SM, color: C.ink3 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: ESTADO_COLOR[e] }} />
            {e}
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: C.ink3, fontFamily: SM, fontSize: 13 }}>Cargando…</div>
      ) : leads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64 }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>📭</div>
          <div style={{ fontFamily: "'Newsreader',Georgia,serif", fontStyle: 'italic', fontSize: 20, color: C.ink, marginBottom: 8 }}>Aún no hay leads</div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Cuando alguien rellene el formulario de la landing, aparecerá aquí.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {leads.map(lead => (
            <div key={lead.id} style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: SN, fontSize: 16, fontWeight: 500, color: C.ink }}>{lead.nombre}</span>
                  <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>·</span>
                  <span style={{ fontFamily: SM, fontSize: 13, color: C.ink2 }}>{lead.restaurante}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <a href={`tel:${lead.telefono}`} style={{ fontFamily: SM, fontSize: 13, color: C.red, textDecoration: 'none', fontWeight: 600 }}>📞 {lead.telefono}</a>
                  {lead.email && <a href={`mailto:${lead.email}`} style={{ fontFamily: SM, fontSize: 13, color: C.ink2, textDecoration: 'none' }}>✉ {lead.email}</a>}
                  <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>{fmt(lead.created_at)}</span>
                </div>
                {lead.notas && <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3, fontStyle: 'italic' }}>{lead.notas}</div>}
              </div>
              <button
                onClick={() => cambiarEstado(lead)}
                style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${ESTADO_COLOR[lead.estado]}`, background: `${ESTADO_COLOR[lead.estado]}18`, color: ESTADO_COLOR[lead.estado], fontFamily: SM, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '.04em', textTransform: 'uppercase' }}
              >
                {lead.estado} →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
