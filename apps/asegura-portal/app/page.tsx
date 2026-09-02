'use client'
import { useState } from 'react'

export default function Entrada() {
  const [destino, setDestino] = useState('')
  const [codigo, setCodigo] = useState('')
  const [fase, setFase] = useState<'pedir' | 'verificar'>('pedir')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

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
    const cuerpo = (await r.json().catch(() => ({}))) as { error?: string; vinculo?: string }
    if (!r.ok) return setError(cuerpo.error ?? 'error')
    // El vínculo con la cartera no bloquea la entrada, pero si no se ha podido
    // resolver se dice antes de irse: un «no tienes pólizas» sin esta línea
    // sería una afirmación sobre algo que no se ha mirado.
    const texto = textoVinculo(cuerpo.vinculo)
    if (texto) {
      setAviso(texto)
      setTimeout(() => (window.location.href = '/boveda'), 2500)
    } else {
      window.location.href = '/boveda'
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '3rem 1rem' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Mis seguros</h1>
      <p className="suave">Todos tus seguros en un sitio. Gratis, seas cliente o no.</p>

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

      {error && <p style={{ color: 'var(--peligro)', marginTop: 12 }}>{textoError(error)}</p>}
      {aviso && <p className="aviso-linea" role="status">{aviso}</p>}
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

/** Solo los estados del vínculo que la persona tiene que saber; el resto no dice nada. */
function textoVinculo(estado: string | undefined): string | null {
  switch (estado) {
    case 'ambiguo':
      return 'Hay varias fichas con este email: el corredor las revisará antes de enseñarte tus pólizas.'
    case 'sin_clave':
    case 'error':
      return 'No se ha podido comprobar la cartera ahora. Entras igual; lo reintentamos la próxima vez.'
    default:
      return null
  }
}
