'use client'

import { useState } from 'react'
import { Sello } from '../_sello'

const LONGITUD = 4
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

type Usuario = { id: string; nombre: string }

// Taller → usuario → PIN. El dispositivo recuerda el código del taller (cookie); cada persona elige su nombre y teclea SU PIN.
export function LoginCliente({ logoUrl, nombre, conFichaje = false, conTaller, usuarios }: {
  logoUrl: string; nombre: string; conFichaje?: boolean; conTaller: boolean; usuarios: Usuario[]
}) {
  const [codigo, setCodigo] = useState('')
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  // null = entrar al taller; 'entrada'/'salida' = el PIN sirve para fichar (no abre sesión).
  const [fichando, setFichando] = useState<null | 'entrada' | 'salida'>(null)
  const [fichado, setFichado] = useState('')

  async function enviarCodigo() {
    setEnviando(true)
    setError('')
    try {
      const res = await fetch('/api/auth/taller', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) return setError(j.error || 'Código no válido')
      window.location.reload()
    } catch {
      setError('Sin conexión. Inténtalo de nuevo')
    } finally {
      setEnviando(false)
    }
  }

  async function otroTaller() {
    setEnviando(true)
    try {
      await fetch('/api/auth/taller', { method: 'DELETE' })
      window.location.reload()
    } finally {
      setEnviando(false)
    }
  }

  async function enviar(valor: string) {
    if (!usuario) return
    setEnviando(true)
    setError('')
    try {
      const res = await fetch(fichando ? '/api/fichar' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fichando ? { usuarioId: usuario.id, pin: valor, accion: fichando } : { usuarioId: usuario.id, pin: valor }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || 'No se pudo entrar')
        setPin('')
        return
      }
      if (fichando) {
        // Solo se muestra «hecho» cuando rrhh lo ha registrado (ok de la API); cualquier fallo salió arriba.
        setFichado(`${fichando === 'entrada' ? 'Entrada' : 'Salida'} registrada`)
        setFichando(null)
        setUsuario(null)
        setPin('')
        return
      }
      window.location.href = '/'
    } catch {
      setError('Sin conexión. Inténtalo de nuevo')
      setPin('')
    } finally {
      setEnviando(false)
    }
  }

  function pulsar(d: string) {
    if (enviando || pin.length >= LONGITUD) return
    const nuevo = pin + d
    setPin(nuevo)
    if (nuevo.length === LONGITUD) void enviar(nuevo)
  }

  const cabecera = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt={nombre} className="login-logo" />
      <Sello />
    </>
  )

  // Paso 1: código del taller.
  if (!conTaller) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={(e) => { e.preventDefault(); if (codigo.trim()) void enviarCodigo() }}>
          {cabecera}
          <p className="tenue">Escribe el código del taller (solo la primera vez en este dispositivo)</p>
          <label className="campo">Código del taller
            <input value={codigo} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={14}
              onChange={(e) => setCodigo(e.target.value)} />
          </label>
          <div className="error" role="alert">{error}</div>
          <button type="submit" className="btn" disabled={enviando || codigo.trim().length < 6}>{enviando ? 'Comprobando…' : 'Continuar'}</button>
        </form>
      </div>
    )
  }

  // Paso 2: quién eres.
  if (!usuario) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          {cabecera}
          <p className="tenue">{fichando ? `¿Quién ficha la ${fichando}?` : '¿Quién eres?'}</p>
          {fichado && <p className="ok" role="status">{fichado}</p>}
          <div className="error" role="alert">{error}</div>
          {usuarios.length === 0 && <p className="tenue">Este taller no tiene personal activo.</p>}
          <div className="lista">
            {usuarios.map((u) => (
              <button key={u.id} type="button" className="btn btn-sec" style={{ minHeight: 56, fontSize: '1.1rem' }}
                onClick={() => { setUsuario(u); setPin(''); setError(''); setFichado('') }}>{u.nombre}</button>
            ))}
          </div>
          {conFichaje && (
            <div className="fila" style={{ marginTop: 12 }}>
              {fichando ? (
                <button type="button" className="btn btn-sec" onClick={() => { setFichando(null); setError('') }}>Cancelar fichaje</button>
              ) : (
                <>
                  <button type="button" className="btn btn-sec" onClick={() => { setFichando('entrada'); setFichado(''); setError('') }}>Fichar entrada</button>
                  <button type="button" className="btn btn-sec" onClick={() => { setFichando('salida'); setFichado(''); setError('') }}>Fichar salida</button>
                </>
              )}
            </div>
          )}
          <p><button type="button" className="btn btn-sec" disabled={enviando} onClick={() => void otroTaller()}>No es mi taller</button></p>
        </div>
      </div>
    )
  }

  // Paso 3: el PIN de esa persona.
  return (
    <div className="login-wrap">
      <div className="login-card">
        {cabecera}
        <p className="tenue">{usuario.nombre}: {fichando ? `introduce tu PIN para fichar la ${fichando}` : 'introduce tu PIN'}</p>
        <div className="pin-puntos" aria-label={`${pin.length} de ${LONGITUD} dígitos`}>
          {Array.from({ length: LONGITUD }, (_, i) => (
            <span key={i} className={i < pin.length ? 'punto lleno' : 'punto'} />
          ))}
        </div>
        <div className="error" role="alert">{error}</div>
        <div className="pad">
          {TECLAS.map(d => (
            <button key={d} type="button" className="tecla" onClick={() => pulsar(d)} disabled={enviando}>{d}</button>
          ))}
          <button type="button" className="tecla tecla-sec" onClick={() => setPin('')} disabled={enviando} aria-label="Borrar todo">C</button>
          <button type="button" className="tecla" onClick={() => pulsar('0')} disabled={enviando}>0</button>
          <button type="button" className="tecla tecla-sec" onClick={() => setPin(pin.slice(0, -1))} disabled={enviando} aria-label="Borrar último">⌫</button>
        </div>
        <p><button type="button" className="btn btn-sec" disabled={enviando} onClick={() => { setUsuario(null); setPin(''); setError('') }}>No soy {usuario.nombre}</button></p>
      </div>
    </div>
  )
}
