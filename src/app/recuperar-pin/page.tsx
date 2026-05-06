'use client'

import { useState } from 'react'

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export default function RecuperarPinPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/recuperar-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setSent(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const bg    = '#14110E'
  const elev  = '#1F1A15'
  const fg    = '#F6F1E7'
  const fg3   = '#6B5F52'
  const ruleS = '#2F2820'
  const red   = '#D9442B'
  const green = '#3F7D44'
  const SE    = "'Newsreader',Georgia,serif"
  const SN    = "'Inter Tight',system-ui,sans-serif"

  if (sent) return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: SN }}>
      <a href="/" style={{ textDecoration: 'none', marginBottom: 32 }}>
        <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: fg }}>ia<span style={{ color: red }}>.</span>rest</span>
      </a>
      <div style={{ width: '100%', maxWidth: 420, background: elev, borderRadius: 16, border: `1px solid ${ruleS}`, padding: '36px 32px', textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(63,125,68,.12)', border: `2px solid ${green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>
        </div>
        <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: fg, margin: '0 0 8px' }}>Email enviado</h2>
        <p style={{ fontSize: 13, color: fg3, lineHeight: 1.6, margin: '0 0 24px' }}>
          Si existe una cuenta con ese email, recibirás tus datos de acceso en unos segundos.
        </p>
        <a href="/login" style={{ display: 'block', background: red, color: '#fff', textDecoration: 'none', textAlign: 'center', padding: '13px', borderRadius: 10, fontSize: 14, fontWeight: 700 }}>
          Volver al login →
        </a>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: SN }}>
      <a href="/" style={{ textDecoration: 'none', marginBottom: 32 }}>
        <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: fg }}>ia<span style={{ color: red }}>.</span>rest</span>
      </a>
      <div style={{ width: '100%', maxWidth: 420, background: elev, borderRadius: 16, border: `1px solid ${ruleS}`, padding: '36px 32px' }}>
        <h1 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 24, color: fg, margin: '0 0 8px' }}>Recuperar acceso</h1>
        <p style={{ fontSize: 13, color: fg3, margin: '0 0 28px', lineHeight: 1.6 }}>
          Introduce el email con el que te registraste y te enviaremos tu código de restaurante y PIN.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#B8AFA6', marginBottom: 6 }}>Email</label>
            <input
              type="email"
              placeholder="maria@labodega.es"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: '100%', background: bg, border: `1px solid ${ruleS}`, borderRadius: 8, padding: '11px 14px', fontSize: 15, color: fg, fontFamily: SN, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {error && (
            <div style={{ background: '#3d1a14', border: `1px solid ${red}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f4a090' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ background: loading ? '#2F2820' : red, color: loading ? fg3 : '#fff', border: 'none', borderRadius: 10, padding: '14px', fontSize: 14, fontWeight: 700, fontFamily: SN, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Enviando...' : 'Enviar datos de acceso →'}
          </button>
        </form>

        <p style={{ fontSize: 12, color: fg3, textAlign: 'center', margin: '20px 0 0', lineHeight: 1.6 }}>
          ¿Sigues sin poder entrar?{' '}
          <a href="https://wa.me/34637349990" target="_blank" rel="noopener noreferrer" style={{ color: '#25D366', textDecoration: 'underline' }}>
            Escríbenos por WhatsApp
          </a>
        </p>
      </div>

      <p style={{ fontSize: 12, color: fg3, marginTop: 24 }}>
        <a href="/login" style={{ color: fg3, textDecoration: 'underline' }}>← Volver al login</a>
      </p>
    </div>
  )
}
