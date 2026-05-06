'use client'

import { useState } from 'react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const T = {
  bg:         'var(--dark-bg)',
  elev:       'var(--dark-elev)',
  elev2:      'var(--dark-elev2)',
  fg:         'var(--dark-fg)',
  fg2:        'var(--dark-fg2)',
  fg3:        'var(--dark-fg3)',
  rule:       'var(--dark-rule)',
  ruleS:      'var(--dark-rule-s)',
  vermilion:  'var(--vermilion)',
  vermilionD: 'var(--vermilion-d)',
  amber:      'var(--amber)',
  green:      'var(--green)',
}

function precioMensual(n: number): number {
  if (n <= 1) return 59
  if (n <= 6) return 59 + (n - 1) * 20
  return 59 + 5 * 20 + (n - 6) * 15
}

export default function RegistroPage() {
  const [nombre, setNombre]       = useState('')
  const [email, setEmail]         = useState('')
  const [restaurante, setRest]    = useState('')
  const [nUsuarios, setNU]        = useState(1)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const precio = precioMensual(nUsuarios)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          nombre:             nombre.trim(),
          email:              email.trim().toLowerCase(),
          nombre_restaurante: restaurante.trim(),
          num_usuarios:       nUsuarios,
        }),
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      // Redirigir a Stripe Checkout
      window.location.href = data.checkout_url
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: 'var(--font-sans)',
    }}>

      {/* Logo */}
      <a href="/" style={{ textDecoration: 'none', marginBottom: 32 }}>
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 28,
          color: T.fg,
          letterSpacing: '-0.5px',
        }}>ia<span style={{ color: T.vermilion }}>.</span>rest</span>
      </a>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 440,
        background: T.elev,
        borderRadius: 16,
        border: `1px solid ${T.ruleS}`,
        padding: '36px 32px',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 26,
          color: T.fg,
          margin: '0 0 6px',
          letterSpacing: '-0.3px',
        }}>14 días gratis</h1>
        <p style={{ fontSize: 14, color: T.fg3, margin: '0 0 28px' }}>
          Sin tarjeta hasta que acabe el trial. Sin permanencia.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Nombre */}
          <div>
            <label style={labelStyle}>Tu nombre</label>
            <input
              type="text"
              placeholder="María García"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {/* Email */}
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              placeholder="maria@labodega.es"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {/* Restaurante */}
          <div>
            <label style={labelStyle}>Nombre del restaurante</label>
            <input
              type="text"
              placeholder="Bodega La Plaza"
              value={restaurante}
              onChange={e => setRest(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {/* Número de usuarios */}
          <div>
            <label style={labelStyle}>
              Usuarios de sala
              <span style={{ color: T.fg3, fontWeight: 400, marginLeft: 6 }}>
                (camareros + jefe de sala)
              </span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setNU(Math.max(1, nUsuarios - 1))}
                style={stepperBtn}
              >−</button>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 22,
                color: T.fg,
                minWidth: 32,
                textAlign: 'center',
              }}>{nUsuarios}</span>
              <button
                type="button"
                onClick={() => setNU(nUsuarios + 1)}
                style={stepperBtn}
              >+</button>
              <span style={{ fontSize: 13, color: T.fg3 }}>
                El dueño no cuenta
              </span>
            </div>
          </div>

          {/* Precio calculado */}
          <div style={{
            background: T.elev2,
            border: `1px solid ${T.ruleS}`,
            borderRadius: 10,
            padding: '14px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 12, color: T.fg3, marginBottom: 2 }}>Total mensual</div>
              <div style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 28,
                color: T.fg,
                letterSpacing: '-0.5px',
              }}>
                {precio}€
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: T.fg3, fontStyle: 'normal' }}>/mes</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: T.fg3, lineHeight: 1.5 }}>
              {nUsuarios === 1 && '59€ base · 1 usuario'}
              {nUsuarios > 1 && nUsuarios <= 6 && `59€ base + ${nUsuarios - 1}×20€`}
              {nUsuarios > 6 && `59€ base + 5×20€ + ${nUsuarios - 6}×15€`}
              <br />
              <span style={{ color: T.green }}>14 días gratis incluidos</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: '#3d1a14',
              border: `1px solid ${T.vermilion}`,
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              color: '#f4a090',
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              background: loading ? T.elev2 : T.vermilion,
              color: loading ? T.fg3 : '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '15px 0',
              fontSize: 15,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              letterSpacing: '-0.2px',
            }}
          >
            {loading ? 'Preparando tu cuenta…' : 'Empezar 14 días gratis →'}
          </button>

        </form>

        <p style={{ fontSize: 12, color: T.fg3, textAlign: 'center', margin: '20px 0 0', lineHeight: 1.6 }}>
          Al continuar aceptas los{' '}
          <a href="/terminos" style={{ color: T.fg2, textDecoration: 'underline' }}>términos de uso</a>.
          Sin permanencia. Cancela cuando quieras.
        </p>
      </div>

      {/* Footer */}
      <p style={{ fontSize: 12, color: T.fg3, marginTop: 24 }}>
        ¿Ya tienes cuenta?{' '}
        <a href="/login" style={{ color: T.fg2, textDecoration: 'underline' }}>Inicia sesión</a>
      </p>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--dark-fg2)',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--dark-bg)',
  border: '1px solid var(--dark-rule-s)',
  borderRadius: 8,
  padding: '11px 14px',
  fontSize: 15,
  color: 'var(--dark-fg)',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  boxSizing: 'border-box',
}

const stepperBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  background: 'var(--dark-elev2)',
  border: '1px solid var(--dark-rule-s)',
  borderRadius: 8,
  color: 'var(--dark-fg)',
  fontSize: 20,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'var(--font-sans)',
}
