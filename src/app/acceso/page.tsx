'use client'
import { useEffect, useState } from 'react'

const C = {
  bg: '#14110E', e1: '#1F1A15', e2: '#2A2118',
  ink: '#F6F1E7', ink2: '#D8CDB6', ink3: '#A89880',
  red: '#D9442B', redD: '#A8311E',
  green: '#3F7D44', amber: '#E8A33B', rule: '#3A2E24',
}
const SE = "'Newsreader',Georgia,serif"
const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

const ROL_DEST: Record<string, string> = {
  super_admin: '/super', owner: '/owner', jefe_sala: '/jefe',
  camarero: '/edge', cocina: '/kds', running: '/running',
}

const ROL_LABEL: Record<string, string> = {
  camarero: 'Camarero', cocina: 'Cocina', jefe_sala: 'Jefe de sala',
  running: 'Running', owner: 'Owner', super_admin: 'Super Admin',
}

export default function AccesoPage() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [msg, setMsg] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState('')
  const [countdown, setCountdown] = useState(2)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tk = params.get('tk')
    if (!tk) { setStatus('error'); setMsg('Enlace sin token válido'); return }

    fetch(`/api/acceso?tk=${encodeURIComponent(tk)}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok || d.error) {
          setStatus('error')
          setMsg(d.error ?? 'Enlace no válido')
          return
        }
        // Guardar sesión en localStorage (mismo mecanismo que login PIN)
        localStorage.setItem('ia_rest_session', JSON.stringify(d.session))
        setNombre(d.session.nombre)
        setRol(d.session.rol)
        setStatus('ok')
      })
      .catch(() => { setStatus('error'); setMsg('Error de red. Comprueba la conexión.') })
  }, [])

  // Countdown y redirect tras éxito
  useEffect(() => {
    if (status !== 'ok') return
    if (countdown <= 0) {
      const s = JSON.parse(localStorage.getItem('ia_rest_session') || '{}')
      const dest = s.rol === 'cocina' && s.seccion_id
        ? `/kds?seccion=${s.seccion_id}`
        : (ROL_DEST[s.rol] ?? '/edge')
      window.location.href = dest
      return
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [status, countdown])

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px', fontFamily: SN,
    }}>
      {/* Logo */}
      <div style={{
        fontFamily: SE, fontStyle: 'italic', fontSize: 28,
        color: C.ink, marginBottom: 40, letterSpacing: '-0.02em',
      }}>
        ia<span style={{ color: C.red }}>.</span>rest
      </div>

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <Spinner />
          <p style={{ color: C.ink2, fontSize: 15, margin: 0 }}>Verificando enlace…</p>
        </div>
      )}

      {status === 'ok' && (
        <div style={{
          background: C.e1, border: `1px solid ${C.rule}`,
          borderRadius: 16, padding: '32px 28px',
          maxWidth: 340, width: '100%', textAlign: 'center',
        }}>
          {/* Check */}
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: C.green + '22', border: `2px solid ${C.green}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none"
              stroke={C.green} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
          </div>

          <p style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink, margin: '0 0 6px' }}>
            ¡Hola, {nombre}!
          </p>
          <p style={{ fontSize: 13, color: C.ink3, margin: '0 0 24px', fontFamily: SM }}>
            {ROL_LABEL[rol] ?? rol}
          </p>

          {/* PWA install hint */}
          <div style={{
            background: C.e2, border: `1px solid ${C.rule}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 24,
            textAlign: 'left',
          }}>
            <p style={{ fontSize: 12, color: C.amber, fontWeight: 700, margin: '0 0 4px', letterSpacing: '.05em' }}>
              INSTALA LA APP
            </p>
            <p style={{ fontSize: 12, color: C.ink2, margin: 0, lineHeight: 1.6 }}>
              Safari: Compartir → <strong style={{ color: C.ink }}>Añadir a inicio</strong><br/>
              Chrome: ⋮ → <strong style={{ color: C.ink }}>Instalar app</strong>
            </p>
          </div>

          <p style={{ fontSize: 13, color: C.ink3, margin: 0 }}>
            Entrando en {countdown}s…
          </p>
          <div style={{
            marginTop: 12, height: 3, background: C.rule, borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', background: C.red, borderRadius: 2,
              width: `${((2 - countdown) / 2) * 100}%`,
              transition: 'width 1s linear',
            }}/>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{
          background: C.e1, border: `1px solid #8B2A1A`,
          borderRadius: 16, padding: '32px 28px',
          maxWidth: 340, width: '100%', textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: C.red + '22', border: `2px solid ${C.red}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none"
              stroke={C.red} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </div>
          <p style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.ink, margin: '0 0 10px' }}>
            Enlace no válido
          </p>
          <p style={{ fontSize: 13, color: C.ink2, margin: '0 0 24px', lineHeight: 1.6 }}>
            {msg}
          </p>
          <button
            onClick={() => window.location.href = '/login'}
            style={{
              background: C.e2, border: `1px solid ${C.rule}`,
              color: C.ink2, fontFamily: SN, fontSize: 13,
              padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
            }}>
            Ir al login
          </button>
        </div>
      )}

      <p style={{ marginTop: 40, fontSize: 11, color: C.ink3, fontFamily: SM }}>
        ia.rest · acceso seguro
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <svg width={36} height={36} viewBox="0 0 24 24" fill="none"
      stroke={C.red} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: 'spin 0.9s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  )
}
