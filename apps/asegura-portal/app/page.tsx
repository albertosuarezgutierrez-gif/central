'use client'
import { useState } from 'react'

export default function Entrada() {
  const [destino, setDestino] = useState('')
  const [codigo, setCodigo] = useState('')
  const [fase, setFase] = useState<'pedir' | 'verificar'>('pedir')
  const [error, setError] = useState<string | null>(null)

  async function pedir() {
    setError(null)
    const r = await fetch('/api/acceso/solicitar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'email', destino }),
    })
    if (r.ok) setFase('verificar')
    else setError((await r.json()).error ?? 'error')
  }

  async function verificar() {
    setError(null)
    const r = await fetch('/api/acceso/verificar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'email', destino, codigo }),
    })
    if (r.ok) window.location.href = '/boveda'
    else setError((await r.json()).error ?? 'error')
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '3rem 1rem' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Mis seguros</h1>
      <p style={{ color: '#4b5563' }}>Todos tus seguros en un sitio. Gratis, seas cliente o no.</p>

      {fase === 'pedir' ? (
        <>
          <input
            type="email"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="tu@email.com"
            style={{ width: '100%', padding: 12, fontSize: 16, minHeight: 44 }}
          />
          <button onClick={pedir} style={{ width: '100%', padding: 12, minHeight: 44, marginTop: 12 }}>
            Enviarme un código
          </button>
        </>
      ) : (
        <>
          <input
            inputMode="numeric"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="123456"
            style={{ width: '100%', padding: 12, fontSize: 16, minHeight: 44 }}
          />
          <button onClick={verificar} style={{ width: '100%', padding: 12, minHeight: 44, marginTop: 12 }}>
            Entrar
          </button>
        </>
      )}

      {error && <p style={{ color: '#b91c1c', marginTop: 12 }}>{textoError(error)}</p>}
    </main>
  )
}

function textoError(codigo: string): string {
  const mapa: Record<string, string> = {
    canal_no_disponible: 'Ese canal todavía no está disponible.',
    envio_fallido: 'No hemos podido enviarte el código. Inténtalo en un momento.',
    caducado: 'El código ha caducado. Pide uno nuevo.',
    ya_usado: 'Ese código ya se usó. Pide uno nuevo.',
    bloqueado: 'Demasiados intentos. Pide un código nuevo.',
    incorrecto: 'El código no es correcto.',
    sin_codigo: 'Pide un código primero.',
  }
  return mapa[codigo] ?? 'Ha ocurrido un error.'
}
