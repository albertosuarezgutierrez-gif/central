'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const C = { primary: '#4f46e5', light: '#eef2ff', bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0', ok: '#16a34a', red: '#dc2626' }

const PASOS = ['Tu empresa', 'Acceso', 'Primer cliente']

export default function RegistroPage() {
  const [paso, setPaso]       = useState(0)
  const [empresa, setEmpresa] = useState({ nombre: '', email: '', telefono: '' })
  const [acceso, setAcceso]   = useState({ password: '', password2: '' })
  const [cliente, setCliente] = useState({ nombre: '', email: '', telefono: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const router = useRouter()

  async function registrar() {
    if (acceso.password !== acceso.password2) { setError('Las contraseñas no coinciden'); return }
    if (acceso.password.length < 8) { setError('Mínimo 8 caracteres'); return }
    setLoading(true)
    const r = await fetch('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...empresa, password: acceso.password, primer_cliente: cliente })
    })
    const d = await r.json()
    if (d.ok) { router.push('/dashboard?welcome=1') }
    else { setError(d.error || 'Error'); setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Nunito', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 12px' }}>🧹</div>
          <h1 style={{ fontWeight: 800, fontSize: 24, color: C.text, letterSpacing: '-0.02em' }}>ialimp</h1>
          <p style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>Coordinación inteligente de limpieza</p>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {PASOS.map((p, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 4, borderRadius: 2, background: i <= paso ? C.primary : C.border, transition: 'background 0.3s', marginBottom: 6 }} />
              <span style={{ fontSize: 11, color: i <= paso ? C.primary : C.muted, fontWeight: i === paso ? 700 : 400 }}>{p}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${C.border}`, padding: '28px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

          {paso === 0 && (
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 18, color: C.text, marginBottom: 20 }}>¿Cómo se llama tu empresa?</h2>
              {[
                { k: 'nombre',    label: 'Nombre de la empresa *', ph: 'Limpiezas García SL' },
                { k: 'email',     label: 'Email de contacto *',    ph: 'info@limpiezasgarcia.es' },
                { k: 'telefono',  label: 'Teléfono',               ph: '6xx xxx xxx' },
              ].map(f => (
                <div key={f.k} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 5 }}>{f.label}</label>
                  <input value={(empresa as any)[f.k]} onChange={e => setEmpresa(p => ({ ...p, [f.k]: e.target.value }))}
                    placeholder={f.ph}
                    style={{ width: '100%', padding: '11px 12px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
                </div>
              ))}
              <button onClick={() => { if (!empresa.nombre || !empresa.email) { setError('Nombre y email obligatorios'); return } setError(''); setPaso(1) }}
                style={{ width: '100%', padding: 14, background: C.primary, color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                Continuar →
              </button>
            </div>
          )}

          {paso === 1 && (
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 18, color: C.text, marginBottom: 20 }}>Crea tu contraseña</h2>
              {[
                { k: 'password',  label: 'Contraseña *',           ph: 'Mínimo 8 caracteres' },
                { k: 'password2', label: 'Repetir contraseña *',   ph: 'Misma contraseña' },
              ].map(f => (
                <div key={f.k} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 5 }}>{f.label}</label>
                  <input type="password" value={(acceso as any)[f.k]} onChange={e => setAcceso(p => ({ ...p, [f.k]: e.target.value }))}
                    placeholder={f.ph}
                    style={{ width: '100%', padding: '11px 12px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setPaso(0)} style={{ flex: 1, padding: 12, background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 14, cursor: 'pointer' }}>← Atrás</button>
                <button onClick={() => { setError(''); setPaso(2) }} style={{ flex: 2, padding: 12, background: C.primary, color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Continuar →</button>
              </div>
            </div>
          )}

          {paso === 2 && (
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 18, color: C.text, marginBottom: 4 }}>Tu primer cliente</h2>
              <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Puedes añadir más después. Puedes saltarte este paso.</p>
              {[
                { k: 'nombre',    label: 'Nombre del cliente',   ph: 'Alberto García' },
                { k: 'email',     label: 'Email (para avisos)',  ph: 'alberto@email.com' },
                { k: 'telefono',  label: 'Teléfono',             ph: '6xx xxx xxx' },
              ].map(f => (
                <div key={f.k} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 5 }}>{f.label}</label>
                  <input value={(cliente as any)[f.k]} onChange={e => setCliente(p => ({ ...p, [f.k]: e.target.value }))}
                    placeholder={f.ph}
                    style={{ width: '100%', padding: '11px 12px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
                </div>
              ))}
              {error && <p style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setPaso(1)} style={{ flex: 1, padding: 12, background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 14, cursor: 'pointer' }}>← Atrás</button>
                <button onClick={registrar} disabled={loading} style={{ flex: 2, padding: 12, background: C.ok, color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
                  {loading ? 'Creando cuenta...' : '🚀 Empezar gratis'}
                </button>
              </div>
              <button onClick={registrar} disabled={loading} style={{ width: '100%', marginTop: 8, padding: 10, background: 'transparent', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer' }}>
                Omitir y empezar sin cliente
              </button>
            </div>
          )}

          {error && paso < 2 && <p style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{error}</p>}
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: C.muted }}>
          ¿Ya tienes cuenta? <a href="/login" style={{ color: C.primary, fontWeight: 600 }}>Entrar</a>
        </p>
      </div>
    </div>
  )
}
