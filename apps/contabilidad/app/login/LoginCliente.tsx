'use client'
import { useState } from 'react'

const MENSAJE: Record<string, string> = {
  email_invalido: 'Ese correo no parece válido.',
  demasiadas_peticiones: 'Demasiadas peticiones. Espera un rato y vuelve a intentarlo.',
  canal_no_disponible: 'El envío de códigos no está disponible ahora mismo. Avisa a Grupo ASegura.',
  envio_fallido: 'No hemos podido enviar el correo. Inténtalo de nuevo en unos minutos.',
  datos_invalidos: 'El código son 6 cifras.',
  incorrecto: 'Código incorrecto.',
  caducado: 'El código ha caducado. Pide otro.',
  ya_usado: 'Ese código ya se usó. Pide otro.',
  bloqueado: 'Demasiados intentos con ese código. Pide otro.',
  sin_codigo: 'Primero pide un código.',
  sin_acceso: 'Ese correo no tiene acceso a ninguna empresa.',
}

/** Correo → código de 6 dígitos (mismo modelo que el Portal del Empleado). */
export function LoginCliente() {
  const [paso, setPaso] = useState<'correo' | 'codigo'>('correo')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function pedir(ev: React.FormEvent) {
    ev.preventDefault()
    setEnviando(true); setError('')
    const r = await fetch('/api/auth/solicitar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const j = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setError(MENSAJE[j.error] ?? 'No se pudo pedir el código.'); return }
    // Solo en desarrollo local sin proveedor (enviado=false): el código no ha salido por correo.
    setAviso(j.enviado
      ? 'Si el correo tiene acceso, te hemos enviado un código de 6 cifras (válido 10 minutos).'
      : 'El envío por correo aún no está conectado: el código se ha generado pero NO se ha enviado. Pide acceso a Grupo ASegura.')
    setPaso('codigo')
  }

  async function entrar(ev: React.FormEvent) {
    ev.preventDefault()
    setEnviando(true); setError('')
    const r = await fetch('/api/auth/verificar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, codigo }) })
    const j = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setError(MENSAJE[j.error] ?? 'No se pudo entrar.'); return }
    window.location.href = j.destino ?? '/'
  }

  if (paso === 'correo') {
    return (
      <form onSubmit={pedir} style={{ width: '100%', display: 'grid', gap: 12 }}>
        <label className="campo">Correo<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <button type="submit" className="btn" disabled={enviando}>{enviando ? 'Pidiendo…' : 'Pedir código'}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    )
  }
  return (
    <form onSubmit={entrar} style={{ width: '100%', display: 'grid', gap: 12 }}>
      {aviso && <p className="tenue" role="status">{aviso}</p>}
      <label className="campo">Código de 6 cifras
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} required className="pin-grande" />
      </label>
      <button type="submit" className="btn" disabled={enviando || codigo.length !== 6}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      <button type="button" className="btn btn-sec" onClick={() => { setPaso('correo'); setCodigo(''); setError('') }}>Cambiar correo</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}
