'use client'
import { useState } from 'react'

import type { ContactoEnmascarado, DatoEnmascarado, EstadoMisDatos } from '@/lib/mis-datos'

/**
 * «Comprueba tus datos de contacto» — el cliente ve lo que tenemos (tapado),
 * dice «siguen igual» o corrige su dirección y su teléfono de CONTACTO.
 *
 * (El fichero conserva el nombre `MiDireccion.tsx` porque el guardián de raíz
 * lo cita por ruta; el componente se llama `MisDatos` desde el 08/09/2026.)
 *
 * ─── Por qué el aviso, y por qué lo decide asegura ───────────────────────────
 * Dictado de Alberto (08/09/2026): «tiene que ser automático, un aviso en la
 * intranet; yo no intervengo». La cartera viene de un volcado de jun/2026: el
 * único que sabe si ese teléfono sigue siendo el suyo es el cliente, así que se
 * le pregunta a él al entrar. El aviso sale cuando la confirmación es `nunca` o
 * `caducada` (>365 días) y se apaga con `vigente`; **cuál de las tres toca la
 * decide el puente**, no esta pantalla: un «hoy» del navegador daría otro
 * resultado que el del servidor y otro más por zona horaria.
 *
 * ─── Las dos cosas que esta pantalla NO puede callar ─────────────────────────
 *
 * 1. 🚨 **Esto no cambia nada en tu compañía.** La dirección de contacto es la
 *    de la correduría; la de la PÓLIZA la tiene la aseguradora y solo se mueve
 *    con un suplemento. Medido el 08/09/2026: la ingesta de CIMA es de una sola
 *    dirección (compañía → nosotros) y ni siquiera toca la dirección, así que no
 *    hay ningún camino automático por el que esto llegue a nadie. Un «dirección
 *    actualizada» a secas le dejaría creer que su seguro de hogar ya cubre la
 *    casa nueva. Es el mismo modo de fallo que «parte enviado ≠ comunicado», y
 *    aquí se paga con una casa sin cobertura.
 *
 * 2. 🚨 **Lo que se enseña está TAPADO, y lo tapa asegura.** La calle y el
 *    teléfono van cifrados con una clave que esta app no tiene (a propósito: es
 *    la app pública). Lo que llega es la máscara que fabrica el puerto —«6••
 *    ••• •12»—, suficiente para reconocer si es el suyo y nada más. Por eso el
 *    formulario de corrección sale VACÍO y lo dice: un campo vacío sin
 *    explicación se lee como «no consta ninguna dirección».
 *
 * ─── Y tres cosas que NO se colapsan ─────────────────────────────────────────
 * - «No consta» (`tiene: false`) ≠ «consta pero no se puede mostrar»
 *   (`tiene: true, mascara: null`). Lo segundo es un dato que existe.
 * - El EMAIL no se edita aquí: es la llave con la que ha entrado. Si es el
 *   mismo, ya está confirmado por el propio acceso y se dice.
 * - Ningún desenlace que no sea `ok` se pinta como guardado ni como confirmado.
 *   `sin_ficha`, `varias_fichas`, `sin_puente` y `error` tienen cada uno su
 *   frase, y ninguna es «todo en orden».
 *
 * ─── Y por qué no hay «solicitar el cambio» ──────────────────────────────────
 * Dictado de Alberto (08/09/2026). Su dirección es suya: el art. 16 RGPD le da
 * derecho a que se rectifique sin dilación indebida, y una cola de aprobación es
 * justo la dilación. Se aplica al momento y le queda al corredor en el historial
 * de la ficha.
 */
type Estado =
  | { tipo: 'listo' }
  | { tipo: 'guardando' }
  | { tipo: 'guardado' }
  | { tipo: 'aviso'; texto: string }

type EstadoConfirmar =
  | { tipo: 'listo' }
  | { tipo: 'enviando' }
  | { tipo: 'aviso'; texto: string }

const CAMPOS = [
  { k: 'telefono', label: 'Teléfono', placeholder: '600 000 000', modo: 'tel' as const, max: 20 },
  { k: 'direccion', label: 'Dirección', placeholder: 'Calle, número, piso', modo: undefined, max: 200 },
  { k: 'codigoPostal', label: 'Código postal', placeholder: '41003', modo: 'numeric' as const, max: 5 },
  { k: 'ciudad', label: 'Ciudad', placeholder: 'Sevilla', modo: undefined, max: 200 },
  { k: 'provincia', label: 'Provincia', placeholder: 'Sevilla', modo: undefined, max: 200 },
] as const

type Clave = (typeof CAMPOS)[number]['k']

const ETIQUETA: Record<Clave, string> = {
  telefono: 'el teléfono',
  direccion: 'la dirección',
  codigoPostal: 'el código postal',
  ciudad: 'la ciudad',
  provincia: 'la provincia',
}

const VACIO: Record<Clave, string> = { telefono: '', direccion: '', codigoPostal: '', ciudad: '', provincia: '' }

export function MisDatos({ inicial }: { inicial: EstadoMisDatos }) {
  // Lo que sabemos de sus datos. Cambia UNA vez, al sellar con «siguen igual»
  // y solo si el puente contestó `ok`: entonces pasa a vigente sin recargar.
  const [situacion, setSituacion] = useState<EstadoMisDatos>(inicial)
  // El formulario de corrección va cerrado: lo que viene a hacer casi todo el
  // mundo es mirar y decir «sí, siguen igual».
  const [editando, setEditando] = useState(false)
  const [f, setF] = useState<Record<Clave, string>>(VACIO)
  const [estado, setEstado] = useState<Estado>({ tipo: 'listo' })
  const [confirmar, setConfirmar] = useState<EstadoConfirmar>({ tipo: 'listo' })

  const algoEscrito = Object.values(f).some((v) => v.trim() !== '')

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!algoEscrito) return
    setEstado({ tipo: 'guardando' })
    // Solo viajan los campos con algo escrito. En blanco NO significa «bórralo»:
    // como el formulario no puede mostrar lo que hay, tratar un hueco como un
    // borrado le vaciaría la ciudad a quien solo venía a cambiar la calle.
    const cuerpo: Record<string, string> = {}
    for (const c of CAMPOS) if (f[c.k].trim() !== '') cuerpo[c.k] = f[c.k].trim()
    try {
      const res = await fetch('/api/mis-datos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const j = (await res.json().catch(() => null)) as { estado?: string; motivo?: string; campo?: string | null } | null
      setEstado(desenlace(j?.estado, j?.motivo, j?.campo))
    } catch {
      setEstado({ tipo: 'aviso', texto: 'No hemos podido guardarlo (no hubo conexión). No se ha cambiado nada: inténtalo en un momento.' })
    }
  }

  async function siguenIgual() {
    setConfirmar({ tipo: 'enviando' })
    try {
      const res = await fetch('/api/mis-datos/confirmar', { method: 'POST' })
      const j = (await res.json().catch(() => null)) as { estado?: string; confirmadoEn?: string } | null
      const d = desenlaceConfirmar(j?.estado, j?.confirmadoEn)
      if (d.tipo === 'confirmado') {
        setConfirmar({ tipo: 'listo' })
        setSituacion((s) => (s.estado === 'ok' ? { ...s, confirmacion: 'vigente', confirmadoEn: d.confirmadoEn } : s))
      } else {
        setConfirmar({ tipo: 'aviso', texto: d.texto })
      }
    } catch {
      setConfirmar({ tipo: 'aviso', texto: 'No hemos podido registrarlo (no hubo conexión). No se ha confirmado nada: inténtalo en un momento.' })
    }
  }

  return (
    <section className="tus-datos" aria-labelledby="mis-datos-titulo">
      <h2 className="lista-titulo" id="mis-datos-titulo">Tus datos de contacto</h2>

      <p className="supresion-intro">
        Son los que usamos para escribirte y llamarte nosotros. <strong>No es la dirección que figura en tus
        pólizas:</strong> cambiarla aquí no se lo comunica a ninguna compañía. Si te has mudado, dínoslo
        también por teléfono o por correo — tu seguro de hogar sigue cubriendo la casa anterior hasta que la
        aseguradora lo cambie.
      </p>

      {situacion.estado === 'ok' && situacion.confirmacion === 'vigente' && (
        <LineaVigente confirmadoEn={situacion.confirmadoEn} onCorregir={() => setEditando(true)} />
      )}

      {situacion.estado === 'ok' && situacion.confirmacion !== 'vigente' && (
        <div className="contacto-revisar" role="region" aria-labelledby="contacto-revisar-titulo">
          <p className="contacto-revisar-titulo" id="contacto-revisar-titulo">Comprueba tus datos de contacto</p>
          <p className="contacto-revisar-texto">
            {situacion.confirmacion === 'caducada'
              ? 'Hace más de un año que los confirmaste. Míralos un momento: si siguen siendo los tuyos, dínoslo con un toque.'
              : 'Parte de estos datos vienen de hace tiempo. Míralos un momento: si siguen siendo los tuyos, dínoslo con un toque.'}
          </p>
          <FichaContacto contacto={situacion.contacto} />
          <div className="contacto-acciones">
            <button type="button" className="boton" onClick={siguenIgual} disabled={confirmar.tipo === 'enviando' || editando}>
              {confirmar.tipo === 'enviando' ? 'Registrando…' : 'Siguen igual'}
            </button>
            <button type="button" className="boton boton-secundario" onClick={() => setEditando(true)} disabled={editando}>
              Corregir
            </button>
          </div>
          {confirmar.tipo === 'aviso' && (
            <p role="status" className="mi-direccion-aviso">{confirmar.texto}</p>
          )}
        </div>
      )}

      {situacion.estado !== 'ok' && (
        <p role="status" className="mi-direccion-aviso">{textoSinEstado(situacion)}</p>
      )}

      {/* Sin ficha o con varias no hay dónde guardar: el formulario no se ofrece,
          y la frase de arriba ya dice que lo arreglamos nosotros. Con el puente
          caído sí se ofrece, porque el fallo puede ser pasajero y el guardado
          dirá lo suyo si no lo es. */}
      {situacion.estado !== 'sin_ficha' && situacion.estado !== 'varias_fichas' && (
        <>
          {!editando && situacion.estado !== 'ok' && (
            <button type="button" className="boton boton-secundario" onClick={() => setEditando(true)}>
              Corregir mis datos
            </button>
          )}

          {editando && (
            <>
              <p className="supresion-intro" style={{ marginTop: 14 }}>
                No podemos mostrarte la que tenemos guardada entera (está cifrada y esta pantalla no puede abrirla; solo
                la versión tapada de arriba), así que los campos salen en blanco. <strong>Escribe solo lo que quieras
                cambiar:</strong> lo que dejes vacío se queda como está. Tu email no se cambia desde aquí: es con el que
                entras.
              </p>

              <form onSubmit={guardar} className="mi-direccion-form">
                {CAMPOS.map((c) => (
                  <label key={c.k} className="mi-direccion-campo">
                    <span>{c.label}</span>
                    <input
                      value={f[c.k]}
                      onChange={(e) => setF((p) => ({ ...p, [c.k]: e.target.value }))}
                      placeholder={c.placeholder}
                      inputMode={c.modo}
                      maxLength={c.max}
                      autoComplete="off"
                    />
                  </label>
                ))}
                <div className="contacto-acciones">
                  <button type="submit" className="boton" disabled={estado.tipo === 'guardando' || !algoEscrito}>
                    {estado.tipo === 'guardando' ? 'Guardando…' : 'Guardar mis datos'}
                  </button>
                  <button
                    type="button"
                    className="boton-tenue"
                    onClick={() => {
                      setEditando(false)
                      setF(VACIO)
                      if (estado.tipo !== 'guardado') setEstado({ tipo: 'listo' })
                    }}
                    disabled={estado.tipo === 'guardando'}
                  >
                    Cerrar
                  </button>
                </div>
              </form>
            </>
          )}

          {estado.tipo === 'guardado' && (
            <p role="status" className="mi-direccion-ok">
              Guardado. Lo usaremos para escribirte a partir de ahora. Recuerda: <strong>esto no cambia la
              dirección de tus pólizas.</strong>
            </p>
          )}
          {estado.tipo === 'aviso' && (
            <p role="status" className="mi-direccion-aviso">{estado.texto}</p>
          )}
        </>
      )}
    </section>
  )
}

/**
 * La línea discreta de cuando ya está confirmado. Es el ÚNICO sitio del fichero
 * que dice «confirmados», y solo se monta bajo `confirmacion === 'vigente'`: el
 * guardián de raíz lo comprueba leyendo el fuente.
 */
function LineaVigente({ confirmadoEn, onCorregir }: { confirmadoEn: string | null; onCorregir: () => void }) {
  const fecha = fechaConfirmacion(confirmadoEn)
  return (
    <p className="contacto-vigente">
      <span>{fecha ? `Datos de contacto confirmados el ${fecha}` : 'Datos de contacto confirmados'}</span>
      <button type="button" className="boton-tenue" onClick={onCorregir}>Corregir</button>
    </p>
  )
}

/** Lo que tenemos, tapado. Tres estados por dato, no dos. */
function FichaContacto({ contacto }: { contacto: ContactoEnmascarado }) {
  return (
    <dl className="datos-leidos contacto-ficha">
      <dt>Teléfono</dt>
      <dd>{textoDato(contacto.telefono)}</dd>
      <dt>Email</dt>
      <dd>
        {textoDato(contacto.email)}
        {contacto.email.tiene && contacto.email.confirmadoPorAcceso && (
          <span className="contacto-nota"> · confirmado con tu acceso</span>
        )}
      </dd>
      <dt>Dirección</dt>
      <dd>{textoDato(contacto.direccion)}</dd>
    </dl>
  )
}

function textoDato(d: DatoEnmascarado) {
  if (!d.tiene) return <span className="pendiente">No consta</span>
  // Consta, pero asegura no ha podido componer la máscara: es un dato que
  // EXISTE. Decir «no consta» aquí sería afirmar una ausencia que no es.
  if (d.mascara === null) return <span className="suave">Consta, pero no se puede mostrar aquí</span>
  return d.mascara
}

/** dd/mm/aaaa en hora de Madrid; `null` si la fecha no se entiende. */
function fechaConfirmacion(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' })
}

/**
 * Cuando no hay estado que enseñar. Cada caso con su frase; ninguno dice que
 * esté confirmado ni en orden, porque no se ha mirado.
 */
function textoSinEstado(s: Exclude<EstadoMisDatos, { estado: 'ok' }>): string {
  switch (s.estado) {
    case 'sin_ficha':
      return 'Tu acceso todavía no está enlazado con tu ficha, así que no podemos enseñarte tus datos de contacto ni cambiarlos. Escríbenos y lo enlazamos.'
    case 'varias_fichas':
      return 'Tienes más de una ficha con nosotros y no queremos enseñarte ni cambiar los datos de la que no es. Lo revisamos y te lo dejamos arreglado.'
    case 'sin_puente':
      return 'Ahora mismo no podemos consultar tus datos de contacto. No se ha comprobado nada; vuelve a intentarlo más tarde.'
    case 'error':
      return 'No hemos podido consultar tus datos de contacto. Es un problema nuestro, no tuyo: lo reintentamos la próxima vez que entres.'
  }
}

/**
 * El desenlace, en las palabras de quien lo lee. Está fuera del componente y es
 * puro para que el guardián pueda comprobar lo único que no se puede equivocar:
 * que **ningún camino que no haya guardado diga «guardado»**.
 */
export function desenlace(estado: string | undefined, motivo?: string, campo?: string | null): Estado {
  switch (estado) {
    case 'ok':
      return { tipo: 'guardado' }
    case 'sin_cambios':
      return { tipo: 'aviso', texto: 'No has cambiado nada: lo que has escrito es lo que ya teníamos.' }
    case 'invalido': {
      const que = campo && campo in ETIQUETA ? ETIQUETA[campo as Clave] : 'lo que has escrito'
      return {
        tipo: 'aviso',
        texto: `Revisa ${que}${motivo ? ` (${motivo})` : ''}. No se ha cambiado nada.`,
      }
    }
    // El dato ya es el principal de otra ficha. No se dice de quién (asegura
    // tampoco lo cuenta) y no se guarda: lo mira el corredor.
    case 'conflicto': {
      const que = campo && campo in ETIQUETA ? ETIQUETA[campo as Clave] : 'ese dato'
      return {
        tipo: 'aviso',
        texto: `${que[0].toUpperCase()}${que.slice(1)} ya consta en otra ficha, así que no lo hemos cambiado; el corredor lo revisará. No se ha cambiado nada más.`,
      }
    }
    // Los dos casos de «no hay dónde guardarlo». No se le echa la culpa ni se le
    // dice que no es cliente: se le dice que hablamos nosotros con él.
    case 'sin_ficha':
      return {
        tipo: 'aviso',
        texto: 'Tu acceso todavía no está enlazado con tu ficha, así que no hemos podido guardarlo. Escríbenos y lo enlazamos.',
      }
    case 'varias_fichas':
      return {
        tipo: 'aviso',
        texto: 'Tienes más de una ficha con nosotros y no queremos escribir los datos en la que no es. Lo revisamos y te lo dejamos arreglado.',
      }
    case 'sin_puente':
      return {
        tipo: 'aviso',
        texto: 'Ahora mismo no podemos guardar cambios de contacto. No se ha cambiado nada; vuelve a intentarlo más tarde.',
      }
    default:
      return {
        tipo: 'aviso',
        texto: 'No hemos podido guardarlo. No se ha cambiado nada: inténtalo de nuevo en un momento.',
      }
  }
}

/**
 * El desenlace de «siguen igual». Igual de puro y por la misma razón: el único
 * camino que devuelve `confirmado` es el `ok` del puente CON su fecha. Sin
 * `case`: el guardián localiza el «guardado» por el primer `case` de `ok` del
 * fichero, que tiene que seguir siendo el de `desenlace`.
 */
export function desenlaceConfirmar(
  estado: string | undefined,
  confirmadoEn: string | undefined,
): { tipo: 'confirmado'; confirmadoEn: string } | { tipo: 'aviso'; texto: string } {
  if (estado === 'ok' && typeof confirmadoEn === 'string') return { tipo: 'confirmado', confirmadoEn }
  if (estado === 'sin_ficha') {
    return { tipo: 'aviso', texto: 'Tu acceso todavía no está enlazado con tu ficha, así que no hemos podido registrarlo. Escríbenos y lo enlazamos.' }
  }
  if (estado === 'varias_fichas') {
    return { tipo: 'aviso', texto: 'Tienes más de una ficha con nosotros y no sabemos cuál confirmar. Lo revisamos y te lo dejamos arreglado.' }
  }
  if (estado === 'sin_puente') {
    return { tipo: 'aviso', texto: 'Ahora mismo no podemos registrar la confirmación. No se ha confirmado nada; vuelve a intentarlo más tarde.' }
  }
  return { tipo: 'aviso', texto: 'No hemos podido registrarlo. No se ha confirmado nada: inténtalo de nuevo en un momento.' }
}
