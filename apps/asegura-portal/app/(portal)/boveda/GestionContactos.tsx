'use client'
import { useState } from 'react'

import type { ContactoPropioFila, ResultadoEscrituraContacto, ResultadoListaContactos, TipoContactoPropio } from '@/lib/contactos-propios'

/**
 * «Configuración» — el cliente añade, marca como principal y borra sus
 * propios teléfonos y correos. Complementa a `MisDatos` (arriba), que solo
 * SUSTITUYE el principal: aquí se puede tener MÁS DE UNO — el del trabajo y
 * el personal, el suyo y el de un familiar que le ayuda — y decidir cuál es
 * el que usamos para avisar.
 *
 * 🚨 Nunca se fuerza un duplicado: si el número que escribe ya es el
 * principal de OTRA ficha, el servidor lo rechaza (`conflicto`) y aquí se le
 * dice que lo resolvemos nosotros — no hay botón «quitárselo a la otra ficha».
 *
 * El VALOR de un contacto no se edita en esta lista (eso es «Tus datos de
 * contacto» de arriba, que sustituye el principal); aquí solo se añade,
 * se marca principal o se borra.
 */
type Estado = { tipo: 'listo' } | { tipo: 'ocupado' } | { tipo: 'aviso'; texto: string }

const ETIQUETA_TIPO: Record<TipoContactoPropio, string> = { telefono: 'Teléfonos', email: 'Correos' }
const PLACEHOLDER: Record<TipoContactoPropio, string> = { telefono: '600 000 000', email: 'tu@correo.es' }

export function GestionContactos({ inicial }: { inicial: ResultadoListaContactos }) {
  const [lista, setLista] = useState(inicial.estado === 'ok' ? inicial.contactos : { telefonos: [], emails: [] })
  const [cargado] = useState(inicial.estado === 'ok')
  const [estado, setEstado] = useState<Estado>({ tipo: 'listo' })
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [nuevoEmail, setNuevoEmail] = useState('')

  if (inicial.estado !== 'ok' && !cargado) {
    // Mismo criterio que `MisDatos`: un fallo de lectura se DICE, no se calla
    // con la sección desaparecida.
    return (
      <section className="seccion" aria-labelledby="config-contactos-titulo">
        <p className="antetitulo">Configuración</p>
        <h2 id="config-contactos-titulo">Tus teléfonos y correos</h2>
        <p className="mi-direccion-aviso" role="status">{porQueNoSeLee(inicial)}</p>
      </section>
    )
  }

  async function aplicar(accion: () => Promise<ResultadoEscrituraContacto>) {
    setEstado({ tipo: 'ocupado' })
    try {
      const r = await accion()
      if (r.estado === 'ok') {
        setLista(r.contactos)
        setEstado({ tipo: 'listo' })
      } else {
        setEstado({ tipo: 'aviso', texto: textoAviso(r) })
      }
    } catch {
      setEstado({ tipo: 'aviso', texto: 'No hemos podido conectar. No se ha cambiado nada: inténtalo en un momento.' })
    }
  }

  async function anadir(tipo: TipoContactoPropio) {
    const valor = (tipo === 'telefono' ? nuevoTelefono : nuevoEmail).trim()
    if (valor === '') return
    await aplicar(async () => {
      const res = await fetch('/api/mis-datos/contactos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipo, valor }),
      })
      return (await res.json()) as ResultadoEscrituraContacto
    })
    if (tipo === 'telefono') setNuevoTelefono('')
    else setNuevoEmail('')
  }

  async function hacerPrincipal(id: string) {
    await aplicar(async () => {
      const res = await fetch(`/api/mis-datos/contactos/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
      })
      return (await res.json()) as ResultadoEscrituraContacto
    })
  }

  async function borrar(id: string) {
    if (!window.confirm('¿Borrar este contacto? Si es el único, dejaremos de poder avisarte por ahí.')) return
    await aplicar(async () => {
      const res = await fetch(`/api/mis-datos/contactos/${encodeURIComponent(id)}`, { method: 'DELETE' })
      return (await res.json()) as ResultadoEscrituraContacto
    })
  }

  const ocupado = estado.tipo === 'ocupado'

  return (
    <section className="seccion" aria-labelledby="config-contactos-titulo">
      <p className="antetitulo">Configuración</p>
      <h2 id="config-contactos-titulo">Tus teléfonos y correos</h2>
      <p className="supresion-intro">
        Puedes tener más de uno de cada — el del trabajo y el personal, por ejemplo — y elegir cuál usamos
        para avisarte. El que marques <strong>principal</strong> es el que reciben los avisos automáticos.
      </p>

      {estado.tipo === 'aviso' && <p role="status" className="mi-direccion-aviso">{estado.texto}</p>}

      {(['telefono', 'email'] as const).map((tipo) => (
        <fieldset key={tipo} className="mis-datos-grupo">
          <legend>{ETIQUETA_TIPO[tipo]}</legend>
          <ul className="config-contactos-lista">
            {(tipo === 'telefono' ? lista.telefonos : lista.emails).map((f) => (
              <FilaContacto key={f.id} f={f} ocupado={ocupado} onHacerPrincipal={() => hacerPrincipal(f.id)} onBorrar={() => borrar(f.id)} />
            ))}
            {(tipo === 'telefono' ? lista.telefonos : lista.emails).length === 0 && (
              <li className="config-contactos-vacio">Todavía no tienes ninguno guardado.</li>
            )}
          </ul>
          <div className="config-contactos-anadir">
            <input
              type={tipo === 'email' ? 'email' : 'tel'}
              value={tipo === 'telefono' ? nuevoTelefono : nuevoEmail}
              onChange={(e) => (tipo === 'telefono' ? setNuevoTelefono(e.target.value) : setNuevoEmail(e.target.value))}
              placeholder={PLACEHOLDER[tipo]}
              inputMode={tipo === 'telefono' ? 'tel' : 'email'}
              maxLength={tipo === 'telefono' ? 40 : 255}
            />
            <button type="button" className="boton-tenue" disabled={ocupado} onClick={() => anadir(tipo)}>
              Añadir
            </button>
          </div>
        </fieldset>
      ))}
    </section>
  )
}

function FilaContacto({
  f,
  ocupado,
  onHacerPrincipal,
  onBorrar,
}: {
  f: ContactoPropioFila
  ocupado: boolean
  onHacerPrincipal: () => void
  onBorrar: () => void
}) {
  return (
    <li className="config-contactos-fila" data-principal={f.principal || undefined}>
      <span className="config-contactos-valor">
        {f.ilegible ? 'No hemos podido leer este dato' : f.valor ?? '—'}
        {f.etiqueta ? <span className="config-contactos-etiqueta"> · {f.etiqueta}</span> : null}
      </span>
      {f.principal ? (
        <span className="config-contactos-principal">Principal</span>
      ) : (
        <button type="button" className="boton-tenue" disabled={ocupado} onClick={onHacerPrincipal}>
          Hacer principal
        </button>
      )}
      <button type="button" className="boton-tenue" disabled={ocupado} onClick={onBorrar} aria-label="Borrar">
        Borrar
      </button>
    </li>
  )
}

function porQueNoSeLee(l: Exclude<ResultadoListaContactos, { estado: 'ok' }>): string {
  switch (l.estado) {
    case 'sin_ficha':
      return 'Tu acceso todavía no está enlazado con tu ficha, así que no podemos enseñarte tus contactos. Escríbenos y lo enlazamos.'
    case 'varias_fichas':
      return 'Tienes más de una ficha con nosotros y no sabemos cuál enseñarte. Lo revisamos y te lo dejamos arreglado.'
    case 'sin_puente':
      return 'Ahora mismo no podemos consultar tus teléfonos y correos. Vuelve a intentarlo más tarde.'
    default:
      return 'No hemos podido cargar tus teléfonos y correos ahora mismo. Vuelve a intentarlo en un momento.'
  }
}

function textoAviso(r: Exclude<ResultadoEscrituraContacto, { estado: 'ok' }>): string {
  switch (r.estado) {
    case 'invalido':
      return `Revisa lo que has escrito${r.motivo ? ` (${r.motivo})` : ''}. No se ha guardado.`
    case 'conflicto':
      return 'Ese dato ya está guardado en otra ficha nuestra, así que no lo hemos añadido. Escríbenos y lo resolvemos.'
    case 'no_encontrado':
      return 'No hemos encontrado ese contacto — puede que ya lo hayas borrado desde otra pestaña.'
    case 'sin_ficha':
      return 'Tu acceso todavía no está enlazado con tu ficha. Escríbenos y lo enlazamos.'
    case 'varias_fichas':
      return 'Tienes más de una ficha con nosotros y no queremos escribir en la que no es. Lo revisamos.'
    case 'sin_puente':
      return 'Ahora mismo no podemos guardar cambios. No se ha cambiado nada; vuelve a intentarlo más tarde.'
    default:
      return 'No hemos podido guardarlo. No se ha cambiado nada: inténtalo de nuevo en un momento.'
  }
}
