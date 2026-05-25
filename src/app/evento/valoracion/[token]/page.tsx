'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const C = { dark: '#14110E', bg2: '#1E1A15', bg3: '#2A221A', paper: '#F6F1E7', ink2: '#D8CDB6', ink3: '#9C8E7E', red: '#D9442B', amber: '#E8A33B', green: '#3F7D44', rule: '#2E2720' }

interface ValoracionData {
  evento: { cliente_nombre: string; fecha_evento: string; tipo: string }
  nps: number | null
}

export default function ValoracionPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<ValoracionData | null>(null)
  const [nps, setNps] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [googleUrl, setGoogleUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/evento/valoracion/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.valoracion) setData(d.valoracion)
        else setError('Enlace no válido')
      })
  }, [token])

  const enviar = async () => {
    const r = await fetch(`/api/evento/valoracion/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nps, comentario })
    })
    const d = await r.json()
    if (d.ok) { setEnviado(true); if (d.google_url) setGoogleUrl(d.google_url) }
    else setError(d.error || 'Error')
  }

  const sh = (s: React.CSSProperties) => s

  if (error) return (
    <div style={sh({ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
      <div style={sh({ color: C.paper, fontFamily: 'Inter Tight, sans-serif', textAlign: 'center' })}>{error}</div>
    </div>
  )

  if (enviado) return (
    <div style={sh({ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' })}>
      <div style={sh({ textAlign: 'center', maxWidth: 400 })}>
        <div style={sh({ fontSize: '3rem', marginBottom: '1rem' })}>🙏</div>
        <h1 style={sh({ fontFamily: 'Newsreader, serif', color: C.paper, fontSize: '1.6rem', marginBottom: '1rem' })}>¡Gracias por tu valoración!</h1>
        <p style={sh({ color: C.ink2, fontFamily: 'Inter Tight, sans-serif' })}>Nos ayuda a mejorar cada evento.</p>
        {googleUrl && (
          <a href={googleUrl} target="_blank" rel="noopener noreferrer"
            style={sh({ display: 'block', marginTop: '1.5rem', padding: '0.9rem', background: C.red, color: C.paper, textDecoration: 'none', borderRadius: 10, fontFamily: 'Inter Tight, sans-serif', fontWeight: 600 })}>
            ⭐ Dejar reseña en Google
          </a>
        )}
      </div>
    </div>
  )

  return (
    <div style={sh({ minHeight: '100vh', background: C.dark, fontFamily: 'Inter Tight, sans-serif', padding: '2rem 1.5rem' })}>
      <div style={sh({ maxWidth: 480, margin: '0 auto' })}>
        <h1 style={sh({ fontFamily: 'Newsreader, serif', color: C.paper, fontSize: '1.6rem', marginBottom: '0.5rem' })}>¿Cómo fue tu evento?</h1>
        {data?.evento && (
          <p style={sh({ color: C.ink3, fontSize: '0.88rem', marginBottom: '2rem' })}>
            {data.evento.cliente_nombre} · {data.evento.fecha_evento?.split('T')[0]}
          </p>
        )}

        <div style={sh({ marginBottom: '2rem' })}>
          <div style={sh({ color: C.ink2, fontSize: '0.88rem', marginBottom: '1rem' })}>¿Del 1 al 10, cómo lo valorarías?</div>
          <div style={sh({ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' })}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} onClick={() => setNps(n)}
                style={sh({ width: 44, height: 44, border: `2px solid ${nps === n ? C.red : C.rule}`, borderRadius: 8, background: nps === n ? C.red : C.bg2, color: C.paper, cursor: 'pointer', fontWeight: nps === n ? 700 : 400, fontSize: '1rem' })}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div style={sh({ marginBottom: '2rem' })}>
          <div style={sh({ color: C.ink2, fontSize: '0.88rem', marginBottom: '0.5rem' })}>Comentario (opcional)</div>
          <textarea value={comentario} onChange={e => setComentario(e.target.value)} rows={3}
            placeholder="¿Qué fue lo mejor? ¿Qué mejorarías?"
            style={sh({ width: '100%', padding: '0.75rem', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.paper, resize: 'vertical', fontFamily: 'Inter Tight, sans-serif', fontSize: '0.95rem', boxSizing: 'border-box' })} />
        </div>

        <button onClick={enviar} disabled={!nps}
          style={sh({ width: '100%', padding: '1rem', background: nps ? C.red : C.bg3, border: 'none', borderRadius: 10, color: C.paper, fontSize: '1rem', fontWeight: 600, cursor: nps ? 'pointer' : 'not-allowed' })}>
          Enviar valoración
        </button>
      </div>
    </div>
  )
}
