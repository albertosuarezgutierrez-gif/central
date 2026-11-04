'use client'
import { useState, useTransition } from 'react'
import { invitarAccion, revocarInvitacionAccion } from './acciones'

type Inv = { id: string; nombre: string; correo: string | null; matricula: string | null; creadaEn: string; caducaEn: string; estado: string }

export function InvitarCita({ caducaDias, invitaciones }: { caducaDias: number; invitaciones: Inv[] }) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [matricula, setMatricula] = useState('')
  const [enlace, setEnlace] = useState<{ url: string; correoRegistrado: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pend, iniciar] = useTransition()

  const enviar = () => iniciar(async () => {
    setError(null)
    const r = await invitarAccion({ nombre, correo, matricula })
    if (r.ok) { setEnlace({ url: r.enlace, correoRegistrado: r.correoRegistrado }); setNombre(''); setCorreo(''); setMatricula('') }
    else setError(r.errores.join(' '))
  })

  return (
    <section className="ficha">
      <button type="button" className="btn" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>Invitar a pedir cita</button>
      {abierto && (
        <form onSubmit={(e) => { e.preventDefault(); enviar() }} className="ficha">
          <label>Nombre del cliente<input value={nombre} maxLength={200} onChange={(e) => setNombre(e.target.value)} required /></label>
          <label>Correo (opcional)<input type="email" value={correo} maxLength={200} onChange={(e) => setCorreo(e.target.value)} /></label>
          <label>Matrícula (opcional)<input value={matricula} maxLength={20} autoCapitalize="characters" onChange={(e) => setMatricula(e.target.value)} /></label>
          <p className="tenue">El enlace vale {caducaDias} días y se puede usar una sola vez.</p>
          <button className="btn" type="submit" disabled={pend || !nombre.trim()}>{pend ? 'Creando…' : 'Crear invitación'}</button>
        </form>
      )}
      {error && <p className="aviso-error" role="alert">{error}</p>}
      {enlace && (
        <div role="status">
          <p className="ok">Enlace para el cliente (solo se muestra ahora; si lo pierdes, crea otra invitación):</p>
          <p className="enlace-copia">{enlace.url}</p>
          <button className="btn btn-sec" type="button" onClick={() => void navigator.clipboard?.writeText(enlace.url)}>Copiar enlace</button>
          <p className="tenue">
            {enlace.correoRegistrado
              ? 'Este taller no tiene correo conectado: el envío queda REGISTRADO, no ha salido nada. Copia el enlace y mándaselo tú.'
              : 'No se envía ningún correo: copia el enlace y mándaselo tú.'}
          </p>
        </div>
      )}
      {invitaciones.length > 0 && (
        <details>
          <summary>Invitaciones recientes ({invitaciones.length})</summary>
          <ul className="lista-simple">
            {invitaciones.map((i) => (
              <li key={i.id}>
                <strong>{i.nombre}</strong>
                <span className="tenue">{i.matricula ? ` · ${i.matricula}` : ''} · {i.estado} · caduca {new Date(i.caducaEn).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}</span>
                {i.estado === 'vigente' && (
                  <button type="button" className="btn btn-sec" onClick={() => void revocarInvitacionAccion(i.id).then(() => location.reload())}>Anular</button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
