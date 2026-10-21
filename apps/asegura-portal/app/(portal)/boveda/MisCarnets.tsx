'use client'
import { useState } from 'react'

import { InterruptorAvisoCarnet } from '@/app/InterruptorAvisoCarnet'
import {
  TEXTO_FALTA_NACIMIENTO,
  faltaNacimiento,
  fechaPrecargada,
  modoInicialCambio,
  necesitaSelectorTitular,
  textoAvisoCarnet,
  textoFechasCarnet,
  titularesEscribibles,
  type ResultadoEscrituraCarnet,
} from '@/lib/carnets-vista'
import { icsCaducidadCarnet, nombreFicheroIcsCarnet } from '@/lib/ics-carnet'
import type { CarnetDeTitular, TitularCarnets } from '@/lib/carnets-titulares'

/**
 * «Mis carnés» (06/10/2026) — el cliente da de alta, corrige y quita sus carnés de conducir. Son los que
 * alimentan el aviso de caducidad de la campana y la precarga de «Recordatorios».
 *
 * - Con UN titular, lista plana («tus carnés»); con varios, agrupada por titular y con selector al añadir.
 * - Se puede teclear la CADUCIDAD (anverso, por defecto) o la EXPEDICIÓN: `apps/asegura` deduce la expedición
 *   desde la caducidad con el nacimiento y guarda solo la expedición; la caducidad que se enseña la calcula
 *   él. 21/10/2026: la tarjeta enseña «Expedido el … · Caduca el …» (la expedición solo llega si el puente
 *   la permite: el titular o quien opera su ficha) y «Cambiar» abre el campo PRECARGADO con la fecha actual,
 *   para verificarla en vez de volver a teclearla. Si falta la caducidad por falta de nacimiento, se dice.
 * - Interruptor «avisarme cuando vaya a caducar» (misma fuente que Configuración) y «Añadir a mi calendario»
 *   (.ics generado aquí, sin enviar nada).
 * - La escritura la hace `apps/asegura` con la misma regla que el corredor; aquí solo se pinta lo que dice.
 *   Un fallo de lectura se DICE (nunca «no tienes carnés»).
 */
type Estado = { tipo: 'listo' } | { tipo: 'ocupado' } | { tipo: 'aviso'; texto: string } | { tipo: 'hecho'; texto: string }
type Formulario = { modo: 'alta' } | { modo: 'cambio'; fichaId: string; carnet: CarnetDeTitular }

type RespuestaApi = ResultadoEscrituraCarnet & { titulares?: TitularCarnets[] | null }

export function MisCarnets({ inicial, tipos, hoy }: { inicial: TitularCarnets[] | null; tipos: readonly string[]; hoy: string }) {
  const [titulares, setTitulares] = useState<TitularCarnets[] | null>(inicial)
  const [estado, setEstado] = useState<Estado>({ tipo: 'listo' })
  const [form, setForm] = useState<Formulario | null>(null)

  if (titulares === null) {
    return (
      <section className="seccion" aria-labelledby="mis-carnets-titulo">
        <p className="antetitulo">Para tus avisos</p>
        <h2 id="mis-carnets-titulo">Tus carnés de conducir</h2>
        <p className="mi-direccion-aviso" role="status">
          No hemos podido consultar tus carnés ahora mismo. No es nada que hayas hecho tú: vuelve a intentarlo en un rato.
        </p>
      </section>
    )
  }

  const escribibles = titularesEscribibles(titulares)
  const varios = titulares.length > 1
  const ocupado = estado.tipo === 'ocupado'

  async function enviar(url: string, metodo: 'POST' | 'PATCH' | 'DELETE', cuerpo: Record<string, string>, hecho: string) {
    setEstado({ tipo: 'ocupado' })
    try {
      const res = await fetch(url, { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = (await res.json().catch(() => null)) as (RespuestaApi & { error?: string; mensaje?: string }) | null
      if (j?.error === 'modo_corredor') {
        setEstado({ tipo: 'aviso', texto: j.mensaje ?? 'Desde la vista de corredor no se escribe en nombre del cliente.' })
        return
      }
      if (!j || typeof j.estado !== 'string') {
        setEstado({ tipo: 'aviso', texto: textoAvisoCarnet({ estado: 'error', causa: `http_${res.status}` }) })
        return
      }
      if (j.estado !== 'ok') {
        setEstado({ tipo: 'aviso', texto: textoAvisoCarnet(j) })
        return
      }
      setForm(null)
      if (Array.isArray(j.titulares)) {
        setTitulares(j.titulares)
        setEstado({ tipo: 'hecho', texto: hecho })
      } else {
        setEstado({ tipo: 'hecho', texto: `${hecho} Recarga la página para ver la lista al día.` })
      }
    } catch {
      setEstado({ tipo: 'aviso', texto: 'No hemos podido conectar. No se ha cambiado nada: inténtalo en un momento.' })
    }
  }

  function borrar(fichaId: string, c: CarnetDeTitular) {
    if (!window.confirm(`¿Quitar el carné ${c.tipo}? Dejaremos de avisarte de cuándo caduca.`)) return
    void enviar(`/api/mis-datos/carnets/${encodeURIComponent(c.id)}`, 'DELETE', { fichaId }, 'Carné quitado.')
  }

  return (
    <section className="seccion" aria-labelledby="mis-carnets-titulo">
      <p className="antetitulo">Para tus avisos</p>
      <h2 id="mis-carnets-titulo">Tus carnés de conducir</h2>
      <p className="supresion-intro">
        Con la fecha de tu carné calculamos cuándo caduca y te avisamos antes (a los 90, 30 y 7 días y el día que
        caduca). Si lo has renovado, cambia su fecha. Para renovarlo,{' '}
        <a href="https://sede.dgt.gob.es" target="_blank" rel="noopener noreferrer">
          sede de la DGT
        </a>
        .
      </p>
      <InterruptorAvisoCarnet />

      {estado.tipo === 'aviso' && <p role="status" className="mi-direccion-aviso">{estado.texto}</p>}
      {estado.tipo === 'hecho' && <p role="status" className="mi-direccion-ok">{estado.texto}</p>}

      {titulares.length === 0 && (
        <p className="config-contactos-vacio">
          Tu acceso todavía no está enlazado con tu ficha, así que aquí no podemos guardar carnés. Escríbenos y lo enlazamos.
        </p>
      )}

      {titulares.map((t) => (
        <fieldset key={t.fichaId || 'unico'} className="mis-datos-grupo">
          {varios && <legend>{t.nombre !== '' ? t.nombre : 'Otra ficha vinculada'}</legend>}
          <ul className="config-contactos-lista">
            {t.carnets.map((c) => (
              <li key={c.id} className="config-contactos-fila">
                <span className="config-contactos-valor">
                  <strong>Carné {c.tipo}</strong>
                  {textoFechasCarnet(c) !== null && <span className="config-contactos-etiqueta"> · {textoFechasCarnet(c)}</span>}
                  {faltaNacimiento(c) && (
                    <span className="config-contactos-etiqueta" role="status" style={{ display: 'block' }}>
                      {TEXTO_FALTA_NACIMIENTO}
                    </span>
                  )}
                </span>
                {c.fechaCaducidad !== null && <BotonCalendario id={c.id} tipo={c.tipo} fechaCaducidad={c.fechaCaducidad} />}
                {t.fichaId !== '' && (
                  <>
                    <button
                      type="button"
                      className="boton-tenue"
                      disabled={ocupado}
                      onClick={() => {
                        setEstado({ tipo: 'listo' })
                        setForm({ modo: 'cambio', fichaId: t.fichaId, carnet: c })
                      }}
                    >
                      Cambiar
                    </button>
                    <button type="button" className="boton-tenue" disabled={ocupado} onClick={() => borrar(t.fichaId, c)}>
                      Quitar
                    </button>
                  </>
                )}
              </li>
            ))}
            {t.carnets.length === 0 && <li className="config-contactos-vacio">Todavía no hay ningún carné guardado.</li>}
          </ul>
        </fieldset>
      ))}

      {form === null && escribibles.length > 0 && (
        <button
          type="button"
          className="boton-tenue"
          disabled={ocupado}
          onClick={() => {
            setEstado({ tipo: 'listo' })
            setForm({ modo: 'alta' })
          }}
        >
          Añadir carné
        </button>
      )}

      {form !== null && (
        <FormularioCarnet
          key={form.modo === 'cambio' ? form.carnet.id : 'alta'}
          form={form}
          titulares={escribibles}
          conSelector={form.modo === 'alta' && necesitaSelectorTitular(titulares)}
          tipos={tipos}
          hoy={hoy}
          ocupado={ocupado}
          onCancelar={() => setForm(null)}
          onGuardar={(fichaId, tipo, cuerpoFecha) =>
            form.modo === 'alta'
              ? enviar('/api/mis-datos/carnets', 'POST', { fichaId, tipo, ...cuerpoFecha }, 'Carné guardado.')
              : enviar(`/api/mis-datos/carnets/${encodeURIComponent(form.carnet.id)}`, 'PATCH', { fichaId, tipo, ...cuerpoFecha }, 'Carné actualizado.')
          }
        />
      )}
    </section>
  )
}

/** Descarga el .ics de la caducidad. Todo en el navegador; si no se puede generar, no hay botón. */
function BotonCalendario({ id, tipo, fechaCaducidad }: { id: string; tipo: string; fechaCaducidad: string }) {
  const descargar = () => {
    const ics = icsCaducidadCarnet({ id, tipo, fechaCaducidad, ahora: new Date() })
    if (ics === null) return
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = nombreFicheroIcsCarnet(tipo)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
  return (
    <button type="button" className="boton-tenue" onClick={descargar}>
      Añadir a mi calendario
    </button>
  )
}

function FormularioCarnet({
  form,
  titulares,
  conSelector,
  tipos,
  hoy,
  ocupado,
  onCancelar,
  onGuardar,
}: {
  form: Formulario
  titulares: TitularCarnets[]
  conSelector: boolean
  tipos: readonly string[]
  hoy: string
  ocupado: boolean
  onCancelar: () => void
  onGuardar: (fichaId: string, tipo: string, cuerpoFecha: Record<string, string>) => void
}) {
  const [fichaId, setFichaId] = useState(form.modo === 'cambio' ? form.fichaId : (titulares[0]?.fichaId ?? ''))
  const [tipo, setTipo] = useState(form.modo === 'cambio' ? form.carnet.tipo : 'B')
  const actual = form.modo === 'cambio' ? form.carnet : null
  const [cual, setCual] = useState<'caducidad' | 'expedicion'>(actual ? modoInicialCambio(actual) : 'caducidad')
  // «Cambiar» abre el campo con la fecha que hay, para poder verificarla; «Añadir», vacío.
  const [fecha, setFecha] = useState(actual ? fechaPrecargada(actual, modoInicialCambio(actual)) : '')
  const listo = fichaId !== '' && tipo !== '' && fecha !== ''

  return (
    <form
      className="mis-carnets-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (listo && !ocupado) onGuardar(fichaId, tipo, cual === 'caducidad' ? { fechaCaducidad: fecha } : { fecha })
      }}
    >
      <p className="mis-carnets-form-titulo">{form.modo === 'alta' ? 'Añadir un carné' : `Cambiar el carné ${form.carnet.tipo}`}</p>
      {conSelector && (
        <label className="mi-direccion-campo">
          <span>¿De quién es el carné?</span>
          <select value={fichaId} onChange={(e) => setFichaId(e.target.value)}>
            {titulares.map((t) => (
              <option key={t.fichaId} value={t.fichaId}>
                {t.nombre !== '' ? t.nombre : 'Otra ficha vinculada'}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="mi-direccion-campo">
        <span>Tipo de carné</span>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="mi-direccion-campo" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <legend>¿Qué fecha tienes a mano?</legend>
        {(
          [
            ['caducidad', 'Caducidad (anverso)'],
            ['expedicion', 'Expedición'],
          ] as const
        ).map(([valor, texto]) => (
          <label key={valor} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
            <input
              type="radio"
              name="cual-fecha-carnet"
              checked={cual === valor}
              onChange={() => {
                setCual(valor)
                setFecha(fechaPrecargada(actual, valor))
              }}
            />
            <span>{texto}</span>
          </label>
        ))}
      </fieldset>
      <label className="mi-direccion-campo">
        <span>{cual === 'caducidad' ? 'Fecha de caducidad' : 'Fecha de expedición'}</span>
        <input type="date" value={fecha} {...(cual === 'expedicion' ? { max: hoy } : {})} onChange={(e) => setFecha(e.target.value)} required />
        <small>
          {cual === 'caducidad'
            ? 'La que ves en el anverso del carné (apartado 4b). Con ella y tu fecha de nacimiento calculamos el resto.'
            : 'La del reverso (apartado 4a/10); si lo renovaste, la de la última renovación.'}
        </small>
      </label>
      <div className="config-contactos-anadir">
        <button type="submit" className="boton-tenue" disabled={!listo || ocupado}>
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="boton-tenue" disabled={ocupado} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
