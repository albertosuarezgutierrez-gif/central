'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth, Session } from '@/hooks/useAuth'

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
  activo: boolean
  ciudad: string
  created_at: string
  camareros: [{ count: number }]
  mesas: [{ count: number }]
  comandas: [{ count: number }]
}

const PLAN_COLOR: Record<string, string> = {
  starter: C.ink3,
  pro: C.red,
  enterprise: C.green,
}

export default function SuperPage() {
  const { session, checking } = useAuth(['super_admin'] as any)
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', slug: '', codigo_acceso: '', plan: 'starter', ciudad: 'Madrid' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

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
      {/* Header */}
      <header style={{
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
          <div style={{ fontFamily: SM, fontSize: 11, color: '#8D8270' }}>
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

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 32px' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 }}>
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
              <div key={r.id} style={{
                background: r.activo ? C.bg : C.bg2, border: `1px solid ${C.rule}`, borderRadius: 8,
                padding: '20px 24px',
                display: 'grid', gridTemplateColumns: '1fr auto auto auto auto',
                alignItems: 'center', gap: 24,
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
                    onClick={() => window.open(`/login?r=${r.codigo_acceso}`, '_blank')}
                    style={{
                      background: 'none', border: `1px solid ${C.rule}`, borderRadius: 4,
                      fontFamily: SM, fontSize: 10, color: C.ink3, padding: '6px 10px',
                      cursor: 'pointer', letterSpacing: '.06em',
                    }}
                  >
                    ABRIR
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
    </div>
  )
}
