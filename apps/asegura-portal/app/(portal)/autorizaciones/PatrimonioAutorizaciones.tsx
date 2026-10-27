'use client'
import { useCallback, useEffect, useId, useState } from 'react'

import { SeccionPlegable } from './SeccionPlegable'

/**
 * Bloque «Patrimonio» de Contactos (27/10/2026): María (titular) deja que su marido José le gestione los pisos.
 *
 * Dos niveles, con las MISMAS frases que el servidor (`niveles` de `GET /api/patrimonio/autorizaciones`, que salen de
 * `QUE_PUEDE_PATRIMONIO` de `@central/module-patrimonio`): «Gestionar» (ver y editar, sin altas ni bajas) y «Total».
 * Mismo flujo que el resto de invitaciones: correo escrito a mano → la otra persona entra con SU correo y un código → acepta.
 *
 * 🚨 Esta pantalla NO decide quién puede conceder: solo pinta los titulares que el servidor devuelve (`titulares`, que son los
 * del propio titular o del Dueño, nunca los de alguien que entró con un acceso Total). Si no hay ninguno, no se ofrece conceder.
 * Revocar corta el acceso en la siguiente petición; lo puede hacer el titular y también quien lo recibió (renunciar).
 */

type Nivel = { alcance: 'patrimonio_gestion' | 'patrimonio_total'; nombre: string; quePuede: string }
type Titular = { clienteId: string; nombre: string | null }
type Concedido = { id: string; clienteId: string; alcance: Nivel['alcance']; nombre: string | null; desde: string }
type Pendiente = { id: string; clienteId: string; alcance: Nivel['alcance']; nombre: string | null; caducaEn: string }
type Recibido = { id: string; alcance: Nivel['alcance']; titular: string | null; desde: string }
type Datos = { titulares: Titular[]; concedidos: Concedido[]; pendientes: Pendiente[]; recibidos: Recibido[]; niveles: Nivel[] }

const fecha = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

const ERRORES: Record<string, string> = {
  no_encontrado: 'No hemos encontrado ese patrimonio entre los tuyos. Vuelve a cargar la pantalla.',
  sin_sesion: 'Se ha cerrado tu sesión. Vuelve a entrar con tu correo.',
  demasiadas_peticiones: 'Has hecho muchos intentos seguidos. Espera un poco y vuelve a probar.',
}

function textoError(cuerpo: { error?: unknown; mensaje?: unknown } | null): string {
  if (typeof cuerpo?.mensaje === 'string' && cuerpo.mensaje.trim() !== '') return cuerpo.mensaje
  if (typeof cuerpo?.error === 'string' && ERRORES[cuerpo.error]) return ERRORES[cuerpo.error]
  return 'No hemos podido guardarlo. Inténtalo otra vez dentro de un momento.'
}

export function PatrimonioAutorizaciones() {
  const uid = useId()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [carga, setCarga] = useState<'cargando' | 'listo' | 'error'>('cargando')

  const [titular, setTitular] = useState('')
  const [alcance, setAlcance] = useState<Nivel['alcance'] | ''>('')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [quitando, setQuitando] = useState<string | null>(null)

  // Recarga SIN desmontar: la lista se queda en pantalla mientras llega la nueva.
  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/patrimonio/autorizaciones', { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const d = (await r.json()) as Datos
      setDatos(d)
      setCarga('listo')
      if (d.titulares.length === 1) setTitular(d.titulares[0].clienteId)
    } catch {
      setCarga('error')
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Fuente caída: se DICE. No se calla como si no hubiera dado acceso a nadie.
  if (carga === 'error' && datos === null) {
    return (
      <SeccionPlegable titulo="Patrimonio" abierto>
        <p className="editor-error" role="alert" style={{ margin: 0 }}>
          No hemos podido comprobar quién tiene acceso a tu patrimonio. Vuelve a cargar la pantalla.
        </p>
      </SeccionPlegable>
    )
  }
  if (datos === null) return null
  // Nada propio que ceder y nada recibido: el bloque no tiene nada que decir.
  if (datos.titulares.length === 0 && datos.recibidos.length === 0) return null

  const nombreTitular = (id: string) => datos.titulares.find((t) => t.clienteId === id)?.nombre ?? 'tu ficha'
  const nombreNivel = (a: Nivel['alcance']) => datos.niveles.find((n) => n.alcance === a)?.nombre ?? '—'
  const varios = datos.titulares.length > 1

  async function invitar() {
    setError(null)
    setHecho(null)
    if (titular === '' || alcance === '') {
      setError('Elige de quién es el patrimonio y qué nivel le das.')
      return
    }
    setEnviando(true)
    try {
      const r = await fetch('/api/patrimonio/autorizaciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ titularClienteId: titular, alcance, email: email.trim(), invitadoNombre: nombre, mensaje }),
      })
      const cuerpo = (await r.json().catch(() => null)) as { error?: unknown; mensaje?: unknown; registrada?: unknown } | null
      if (r.ok || cuerpo?.registrada === true) {
        setHecho(
          r.ok
            ? `Invitación enviada. ${nombre.trim()} tiene que entrar con su correo y aceptarla; hasta entonces no ve nada.`
            : textoError(cuerpo),
        )
        setNombre('')
        setEmail('')
        setMensaje('')
        setAlcance('')
        await cargar()
        return
      }
      setError(textoError(cuerpo))
    } catch {
      setError('No hemos podido enviarlo: comprueba tu conexión e inténtalo otra vez.')
    } finally {
      setEnviando(false)
    }
  }

  async function quitar(ruta: string, id: string) {
    setQuitando(id)
    setError(null)
    try {
      const r = await fetch(ruta, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ruta.startsWith('/api/invitaciones/') ? { accion: 'retirar' } : { accion: 'revocar' }),
      })
      if (!r.ok) setError(textoError((await r.json().catch(() => null)) as { error?: unknown; mensaje?: unknown } | null))
      await cargar()
    } catch {
      setError('No hemos podido guardarlo: comprueba tu conexión e inténtalo otra vez.')
    } finally {
      setQuitando(null)
    }
  }

  const fila = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, padding: '10px 0', borderTop: '1px solid var(--border)' }

  return (
    <SeccionPlegable
      titulo="Patrimonio"
      resumen={datos.concedidos.length > 0 ? `${datos.concedidos.length} con acceso` : null}
      abierto={datos.concedidos.length === 0 && datos.pendientes.length === 0}
    >
      {datos.titulares.length > 0 && (
        <>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            Deja que otra persona te ayude con tus inmuebles y alquileres. Hay <strong>dos niveles</strong>:
          </p>
          {datos.niveles.map((n) => (
            <p key={n.alcance} style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>
              <strong>{n.nombre}.</strong> Podrá {n.quePuede}
            </p>
          ))}
          <p className="editor-ayuda" style={{ margin: '8px 0 0' }}>
            Con ninguno de los dos podrá autorizar a nadie más ni verá tus seguros. Puedes quitarle el acceso cuando quieras y se
            corta en ese momento.
          </p>

          {datos.concedidos.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 14 }}>Tienen acceso</strong>
              {datos.concedidos.map((c) => (
                <div key={c.id} style={fila}>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <strong>{c.nombre ?? 'Una persona'}</strong> · {nombreNivel(c.alcance)}
                    {varios ? ` · ${nombreTitular(c.clienteId)}` : ''}
                    {fecha(c.desde) ? <span className="editor-ayuda" style={{ display: 'block' }}>Desde el {fecha(c.desde)}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="boton secundario"
                    disabled={quitando !== null}
                    onClick={() => void quitar(`/api/patrimonio/autorizaciones/${c.id}`, c.id)}
                  >
                    {quitando === c.id ? 'Quitando…' : 'Quitar el acceso'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {datos.pendientes.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 14 }}>Invitaciones sin contestar</strong>
              {datos.pendientes.map((p) => (
                <div key={p.id} style={fila}>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <strong>{p.nombre ?? 'Una persona'}</strong> · {nombreNivel(p.alcance)}
                    {varios ? ` · ${nombreTitular(p.clienteId)}` : ''}
                    {fecha(p.caducaEn) ? (
                      <span className="editor-ayuda" style={{ display: 'block' }}>Caduca el {fecha(p.caducaEn)}. Hasta que acepte, no ve nada.</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="boton secundario"
                    disabled={quitando !== null}
                    onClick={() => void quitar(`/api/invitaciones/${p.id}`, p.id)}
                  >
                    {quitando === p.id ? 'Retirando…' : 'Retirar la invitación'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="editor" style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
            <strong style={{ fontSize: 14 }}>Dar acceso a alguien</strong>
            {varios && (
              <div className="editor-campo">
                <label htmlFor={`${uid}-titular`}>De quién es el patrimonio</label>
                <select id={`${uid}-titular`} className="campo" value={titular} disabled={enviando} onChange={(e) => setTitular(e.target.value)}>
                  <option value="">Elige…</option>
                  {datos.titulares.map((t) => (
                    <option key={t.clienteId} value={t.clienteId}>
                      {t.nombre ?? 'Ficha sin nombre'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <fieldset className="editor-campo grupo">
              <legend>Qué nivel le das</legend>
              <div className="opciones" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                {datos.niveles.map((n) => (
                  <label key={n.alcance} className="opcion" style={{ alignItems: 'flex-start', minHeight: 44 }}>
                    <input
                      type="radio"
                      name={`${uid}-nivel`}
                      value={n.alcance}
                      checked={alcance === n.alcance}
                      disabled={enviando}
                      onChange={() => setAlcance(n.alcance)}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ minWidth: 0 }}>
                      {n.alcance === 'patrimonio_gestion' ? 'Gestionar (ver y editar, sin dar de alta ni de baja inmuebles)' : 'Total'}
                      <span className="editor-ayuda" style={{ display: 'block', fontWeight: 400 }}>
                        Podrá {n.quePuede}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="editor-campo">
              <label htmlFor={`${uid}-nombre`}>Cómo se llama</label>
              <input id={`${uid}-nombre`} className="campo" value={nombre} maxLength={120} disabled={enviando} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="editor-campo">
              <label htmlFor={`${uid}-email`}>Su correo electrónico</label>
              <input
                id={`${uid}-email`}
                type="email"
                inputMode="email"
                autoComplete="off"
                className="campo"
                value={email}
                disabled={enviando}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(null)
                }}
              />
              <span className="editor-ayuda">Le llega un enlace; entrará con ese correo y un código. A quien se lo reenvíe no le sirve.</span>
            </div>
            <div className="editor-campo">
              <label htmlFor={`${uid}-mensaje`}>Mensaje (opcional)</label>
              <textarea id={`${uid}-mensaje`} className="campo" rows={2} maxLength={300} value={mensaje} disabled={enviando} onChange={(e) => setMensaje(e.target.value)} />
            </div>
            <div className="editor-acciones">
              <button type="button" className="boton" disabled={enviando} onClick={() => void invitar()}>
                {enviando ? 'Enviando…' : 'Enviar la invitación'}
              </button>
            </div>
          </div>
        </>
      )}

      {datos.recibidos.length > 0 && (
        <div style={{ marginTop: datos.titulares.length > 0 ? 16 : 0 }}>
          <strong style={{ fontSize: 14 }}>Te han dado acceso a su patrimonio</strong>
          {datos.recibidos.map((r) => (
            <div key={r.id} style={fila}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <strong>{r.titular ?? 'Una persona'}</strong> · {nombreNivel(r.alcance)}
              </span>
              <button
                type="button"
                className="boton secundario"
                disabled={quitando !== null}
                onClick={() => void quitar(`/api/patrimonio/autorizaciones/${r.id}`, r.id)}
              >
                {quitando === r.id ? 'Renunciando…' : 'Renunciar a este acceso'}
              </button>
            </div>
          ))}
        </div>
      )}

      {hecho && (
        <p className="linea dicho" role="status" style={{ marginTop: 12 }}>
          {hecho}
        </p>
      )}
      {error && (
        <p className="editor-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </SeccionPlegable>
  )
}
