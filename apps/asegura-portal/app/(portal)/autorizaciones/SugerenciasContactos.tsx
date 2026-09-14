'use client'
import { useCallback, useEffect, useId, useState } from 'react'

import { ALCANCES_CONCEDIBLES, type Alcance } from '@central/module-seguros-portal'

/**
 * «También conocemos a…» — el atajo de pedir acceso a partir de relaciones que
 * Alberto ya tiene cargadas (`cliente_relaciones`), sin escribir un correo.
 *
 * Sección PROPIA, con su propia carga y su propio error: si `/api/sugerencias`
 * falla, eso no puede tumbar el resto de la pantalla (dar/recibir acceso), que
 * no depende de esto — mismo criterio que las invitaciones de
 * `Autorizaciones()`.
 *
 * 🚨 «Nada que sugerir» y «no hemos podido mirar» son mensajes DISTINTOS. Un
 * `[]` por fallo de red diciendo «no conocemos a nadie de tu entorno» es la
 * misma mentira que el resto del portal evita: aquí también se distingue
 * cargando ≠ error ≠ vacío de verdad.
 */

type Sugerencia = { relacionadoId: string; relacionadoNombre: string | null; tipo: string }
type Carga = 'cargando' | 'listo' | 'error'
type Envio = 'idle' | 'enviando' | 'enviado' | 'error'

export function SugerenciasContactos() {
  const uid = useId()
  const [carga, setCarga] = useState<Carga>('cargando')
  const [lista, setLista] = useState<Sugerencia[]>([])
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCarga('cargando')
    setError(null)
    try {
      const r = await fetch('/api/sugerencias', { cache: 'no-store' })
      if (!r.ok) {
        setCarga('error')
        setError(
          r.status === 401
            ? 'Se ha cerrado tu sesión. Vuelve a entrar con tu email para ver tus sugerencias.'
            : 'No hemos podido mirar si conocemos a alguien de tu entorno. Vuelve a intentarlo.',
        )
        return
      }
      const cuerpo = (await r.json()) as { sugerencias: Sugerencia[] }
      setLista(cuerpo.sugerencias ?? [])
      setCarga('listo')
    } catch {
      setCarga('error')
      setError('No hemos podido mirar tus sugerencias: comprueba tu conexión e inténtalo otra vez.')
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Nada que ofrecer y sin error: la sección no aparece. Una tarjeta casi
  // siempre vacía parece un producto a medio hacer (regla ya aplicada a «Mis
  // seguros» aportadas, 05/09/2026), y aquí es el caso normal para la mayoría.
  if (carga === 'listo' && lista.length === 0) return null

  return (
    <section className="seccion" aria-labelledby={`${uid}-sugerencias`}>
      <h2 id={`${uid}-sugerencias`}>También conocemos a</h2>
      <p className="suave" style={{ marginTop: 0 }}>
        Personas o empresas que ya tenemos relacionadas con tu ficha. Puedes pedirles acceso sin escribir
        su correo.
      </p>

      {carga === 'cargando' ? (
        <p className="suave" style={{ margin: 0 }}>
          Comprobando tu entorno…
        </p>
      ) : carga === 'error' ? (
        <>
          <p className="editor-error" role="alert" style={{ marginTop: 0 }}>
            {error}
          </p>
          <button type="button" className="boton" onClick={() => void cargar()}>
            Volver a intentarlo
          </button>
        </>
      ) : (
        <div className="opciones" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          {lista.map((s) => (
            <SugerenciaFila key={s.relacionadoId} uid={uid} sugerencia={s} />
          ))}
        </div>
      )}
    </section>
  )
}

function SugerenciaFila({ uid, sugerencia }: { uid: string; sugerencia: Sugerencia }) {
  const [alcance, setAlcance] = useState<Alcance>('ver')
  const [envio, setEnvio] = useState<Envio>('idle')
  const [mensaje, setMensaje] = useState<string | null>(null)

  const pedir = useCallback(async () => {
    setEnvio('enviando')
    setMensaje(null)
    try {
      const r = await fetch('/api/sugerencias/pedir', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ relacionadoClienteId: sugerencia.relacionadoId, alcance }),
      })
      const cuerpo = (await r.json().catch(() => null)) as { texto?: string; mensaje?: string } | null
      if (r.ok) {
        setEnvio('enviado')
        setMensaje(cuerpo?.texto ?? 'Petición enviada.')
      } else {
        setEnvio('error')
        setMensaje(cuerpo?.mensaje ?? 'No hemos podido enviar la petición. Vuelve a intentarlo.')
      }
    } catch {
      setEnvio('error')
      setMensaje('No hemos podido enviar la petición: comprueba tu conexión e inténtalo otra vez.')
    }
  }, [alcance, sugerencia.relacionadoId])

  return (
    <div className="cartera" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <strong>{sugerencia.relacionadoNombre ?? 'Sin nombre'}</strong>
        <span className="suave"> · {sugerencia.tipo}</span>
      </div>

      {envio === 'enviado' ? (
        <p className="suave" style={{ margin: 0 }}>
          {mensaje}
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label htmlFor={`${uid}-${sugerencia.relacionadoId}-alcance`} className="suave">
            Quiero
          </label>
          <select
            id={`${uid}-${sugerencia.relacionadoId}-alcance`}
            className="campo"
            value={alcance}
            onChange={(e) => setAlcance(e.target.value as Alcance)}
            disabled={envio === 'enviando'}
            style={{ width: 'auto' }}
          >
            {ALCANCES_CONCEDIBLES.map((a) => (
              <option key={a} value={a}>
                {a === 'ver' ? 'ver sus seguros' : 'ver también lo económico'}
              </option>
            ))}
          </select>
          <button type="button" className="boton" disabled={envio === 'enviando'} onClick={() => void pedir()}>
            {envio === 'enviando' ? 'Enviando…' : 'Pedir acceso'}
          </button>
        </div>
      )}

      {envio === 'error' && (
        <p className="editor-error" role="alert" style={{ margin: 0 }}>
          {mensaje}
        </p>
      )}
    </div>
  )
}
