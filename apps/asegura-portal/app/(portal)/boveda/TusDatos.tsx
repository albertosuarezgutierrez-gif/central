'use client'
import { useState } from 'react'

import { DIAS_RESPUESTA, loQueSeConserva, loQueSeSuprime } from '@central/module-seguros-portal'

import { fechaEs } from '@/lib/fechas'

/**
 * «Quiero que borréis mis datos» — el ejercicio del derecho de supresión
 * (art. 17 RGPD) desde la pantalla del cliente.
 *
 * 🚨 ESTA PANTALLA NO PROMETE UN BORRADO, y esa es su decisión central. El art.
 * 17.3.b y el 17.3.e excluyen la supresión cuando hace falta cumplir una
 * obligación legal o defender reclamaciones, y una correduría tiene las dos. Un
 * botón «Borrar mi cuenta» que dijera «hecho» sería mentirle a quien confía en
 * la pantalla; uno que borrara de verdad destruiría documentación que la ley
 * obliga a guardar.
 *
 * Por eso las DOS listas se enseñan **antes de pulsar** y otra vez en el acuse:
 * quien pide que le borren tiene derecho a saber desde el primer momento que
 * parte de sus datos van a seguir ahí, y por qué (art. 12.4 — la negativa
 * parcial hay que motivarla, no basta con callar). Enseñárselo solo en la
 * respuesta final es dejarle creer durante un mes que se borró todo.
 *
 * Y las listas se CALCULAN (`loQueSeSuprime` / `loQueSeConserva` del módulo
 * puro), no se escriben aquí: una copia a mano se desincroniza en cuanto se
 * añade una categoría, y entonces la pantalla estaría prometiendo un borrado
 * que el corredor no va a hacer.
 */

type Solicitud = {
  id: string
  recibidaEn: string
  estado: string
  plazo: 'resuelta' | 'en_plazo' | 'urgente' | 'vencido'
  fechaLimite: string
  resueltaEn: string | null
  respuesta: string | null
}

const ETIQUETA_ESTADO: Record<string, string> = {
  recibida: 'Recibida',
  en_curso: 'En curso',
  resuelta_total: 'Resuelta: se suprimió todo lo que se podía',
  resuelta_parcial: 'Resuelta: se suprimió una parte',
  denegada: 'Denegada',
  retirada: 'La retiraste',
}

export function TusDatos({ inicial }: { inicial: Solicitud[] }) {
  const [solicitudes, setSolicitudes] = useState(inicial)
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abierta = solicitudes.find((s) => s.estado === 'recibida' || s.estado === 'en_curso')

  async function pedir() {
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch('/api/supresion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ motivo: motivo.trim() || undefined }),
      })
      if (!r.ok) {
        setError('No hemos podido registrar tu solicitud. Inténtalo de nuevo en un momento.')
        return
      }
      const datos = (await r.json()) as { solicitud: Solicitud }
      setSolicitudes((prev) => [datos.solicitud, ...prev.filter((s) => s.id !== datos.solicitud.id)])
      setAbierto(false)
      setMotivo('')
    } catch {
      setError('No hemos podido registrar tu solicitud. Inténtalo de nuevo en un momento.')
    } finally {
      setEnviando(false)
    }
  }

  async function retirar(id: string) {
    const r = await fetch('/api/supresion', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!r.ok) {
      setError('No hemos podido retirarla. Inténtalo de nuevo en un momento.')
      return
    }
    const datos = (await r.json()) as { solicitud: Solicitud }
    setSolicitudes((prev) => prev.map((s) => (s.id === datos.solicitud.id ? datos.solicitud : s)))
  }

  return (
    <section className="tus-datos">
      <h2 className="lista-titulo">Tus datos</h2>

      {abierta ? (
        // Lo primero que ve quien ya la pidió es SU solicitud y la fecha
        // comprometida, no otra vez el botón.
        <div className="supresion-estado">
          <p>
            <strong>Solicitud de supresión registrada</strong> el {fechaEs(new Date(abierta.recibidaEn))}.
          </p>
          <p>
            Tenemos que contestarte <strong>antes del {fechaEs(new Date(abierta.fechaLimite))}</strong> (un
            mes desde que la recibimos, art. 12.3 del RGPD). Te diremos qué se ha suprimido y qué no, y por
            qué.
          </p>
          <button type="button" className="boton boton-secundario" onClick={() => retirar(abierta.id)}>
            Retirar la solicitud
          </button>
        </div>
      ) : (
        <>
          <p className="supresion-intro">
            Puedes pedirnos que suprimamos tus datos. Antes de pulsar, lee qué se puede suprimir y qué no:
            hay documentación que la ley nos obliga a conservar, y preferimos decírtelo ahora y no dentro de
            un mes.
          </p>

          {/* Las dos listas van juntas y a la vista. Enseñar solo la primera
              dejaría creer que lo demás también desaparece. */}
          <div className="supresion-alcance">
            <div>
              <h3>Lo que se suprime</h3>
              <ul>
                {loQueSeSuprime().map((a) => (
                  <li key={a.que}>
                    <strong>{a.que}.</strong> {a.motivo}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Lo que tenemos que conservar</h3>
              <ul>
                {loQueSeConserva().map((a) => (
                  <li key={a.que}>
                    <strong>{a.que}.</strong> {a.motivo}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {abierto ? (
            <div className="supresion-form">
              <label className="editor-campo" htmlFor="supresion-motivo">
                Si quieres, cuéntanos por qué <span className="opcional">(opcional)</span>
              </label>
              {/* Opcional de verdad: el art. 17 no exige motivar la solicitud, y
                  pedirlo como obligatorio sería un peaje al ejercicio de un derecho. */}
              <textarea
                id="supresion-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={1000}
              />
              <div className="editor-acciones">
                <button type="button" className="boton" onClick={pedir} disabled={enviando}>
                  {enviando ? 'Registrando…' : 'Registrar mi solicitud'}
                </button>
                <button type="button" className="boton boton-secundario" onClick={() => setAbierto(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="boton" onClick={() => setAbierto(true)}>
              Solicitar la supresión de mis datos
            </button>
          )}
          <p className="supresion-plazo">
            Te contestaremos en el plazo de un mes ({DIAS_RESPUESTA} días) desde que la recibimos.
          </p>
        </>
      )}

      {error && <p className="editor-error">{error}</p>}

      {/* El historial se queda: es la prueba de que ejerciste el derecho y de
          que se te atendió. Por eso una retirada se MARCA y no se borra. */}
      {solicitudes.filter((s) => s.id !== abierta?.id).length > 0 && (
        <div className="supresion-historial">
          <h3>Solicitudes anteriores</h3>
          <ul>
            {solicitudes
              .filter((s) => s.id !== abierta?.id)
              .map((s) => (
                <li key={s.id}>
                  {fechaEs(new Date(s.recibidaEn))} — {ETIQUETA_ESTADO[s.estado] ?? s.estado}
                  {s.respuesta && <span className="supresion-respuesta"> {s.respuesta}</span>}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  )
}
