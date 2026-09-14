'use client'
import { useState } from 'react'

import type { CampoMisDatos, LecturaMisDatos } from '@/lib/mis-datos'

/**
 * «Mis datos» — el cliente ve y corrige su teléfono, su correo y su dirección
 * de CONTACTO.
 *
 * ─── Las dos cosas que esta pantalla NO puede callar ─────────────────────────
 *
 * 1. 🚨 **Esto no cambia nada en tu compañía.** Los datos de contacto son los
 *    de la correduría; los de la PÓLIZA los tiene la aseguradora y solo se
 *    mueven con un suplemento. Medido el 08/09/2026: la ingesta de CIMA es de
 *    una sola dirección (compañía → nosotros) y ni siquiera toca la dirección,
 *    así que no hay ningún camino automático por el que esto llegue a nadie. Un
 *    «dirección actualizada» a secas le dejaría creer que su seguro de hogar ya
 *    cubre la casa nueva. Es el mismo modo de fallo que «parte enviado ≠
 *    comunicado», y aquí se paga con una casa sin cobertura.
 *
 * 2. 🚨 **Lo que no se ha podido leer se dice; no sale un hueco.** Los datos
 *    llegan del puerto de asegura, que es quien los descifra (esta app no tiene
 *    la clave a propósito). Si la lectura falla —el puente no está montado, su
 *    acceso no está enlazado con una ficha, o lo está con varias— el
 *    formulario sale vacío Y LO DICE. Un campo vacío sin explicación se lee
 *    como «no consta ningún teléfono», que es afirmar algo que no se ha mirado.
 *
 * ─── Qué viaja al guardar ────────────────────────────────────────────────────
 * Solo lo que la persona CAMBIÓ respecto a lo que se le enseñó. Si se pudo leer
 * la ficha, vaciar un campo de la dirección viaja como `null` («quítalo»); si
 * NO se pudo leer, un campo en blanco no viaja —no sabemos qué había y no se
 * borra a ciegas—. El teléfono y el correo nunca viajan vacíos: desde aquí se
 * cambian por otro, no se borran.
 *
 * ─── Y por qué no hay «solicitar el cambio» ──────────────────────────────────
 * Dictado de Alberto (08/09/2026). Sus datos son suyos: el art. 16 RGPD le da
 * derecho a que se rectifiquen sin dilación indebida, y una cola de aprobación
 * es justo la dilación. Se aplica al momento y le queda al corredor en el
 * historial de la ficha.
 */
type Estado =
  | { tipo: 'listo' }
  | { tipo: 'guardando' }
  | { tipo: 'guardado'; texto: string }
  | { tipo: 'aviso'; texto: string }

type Campo = {
  k: CampoMisDatos
  label: string
  placeholder: string
  modo?: 'numeric' | 'tel' | 'email'
  tipo?: 'tel' | 'email'
  max: number
  autoComplete: string
}

const CANALES: readonly Campo[] = [
  { k: 'telefono', label: 'Teléfono', placeholder: '600 000 000', modo: 'tel', tipo: 'tel', max: 40, autoComplete: 'tel' },
  { k: 'email', label: 'Correo electrónico', placeholder: 'tu@correo.es', modo: 'email', tipo: 'email', max: 255, autoComplete: 'email' },
]
const DIRECCION: readonly Campo[] = [
  { k: 'direccion', label: 'Dirección', placeholder: 'Calle, número, piso', max: 200, autoComplete: 'street-address' },
  { k: 'codigoPostal', label: 'Código postal', placeholder: '41003', modo: 'numeric', max: 5, autoComplete: 'postal-code' },
  { k: 'ciudad', label: 'Ciudad', placeholder: 'Sevilla', max: 200, autoComplete: 'address-level2' },
  { k: 'provincia', label: 'Provincia', placeholder: 'Sevilla', max: 200, autoComplete: 'address-level1' },
]
const CAMPOS: readonly Campo[] = [...CANALES, ...DIRECCION]

const ETIQUETA: Record<CampoMisDatos, string> = {
  telefono: 'el teléfono',
  email: 'el correo',
  direccion: 'la dirección',
  codigoPostal: 'el código postal',
  ciudad: 'la ciudad',
  provincia: 'la provincia',
}

type Valores = Record<CampoMisDatos, string>

function vacios(): Valores {
  return { telefono: '', email: '', direccion: '', codigoPostal: '', ciudad: '', provincia: '' }
}

export function MisDatos({ lectura }: { lectura: LecturaMisDatos }) {
  const leido = lectura.estado === 'ok'
  const original: Valores = leido
    ? {
        telefono: lectura.contacto.telefono ?? '',
        email: lectura.contacto.email ?? '',
        direccion: lectura.contacto.direccion ?? '',
        codigoPostal: lectura.contacto.codigoPostal ?? '',
        ciudad: lectura.contacto.ciudad ?? '',
        provincia: lectura.contacto.provincia ?? '',
      }
    : vacios()
  const [f, setF] = useState<Valores>(original)
  const [estado, setEstado] = useState<Estado>({ tipo: 'listo' })

  const cambios = cambiosRespectoA(original, f, leido)
  const hayCambios = Object.keys(cambios).length > 0

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!hayCambios) return
    setEstado({ tipo: 'guardando' })
    try {
      const res = await fetch('/api/mis-datos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cambios),
      })
      const j = (await res.json().catch(() => null)) as { estado?: string; motivo?: string; campo?: string | null; campos?: string[] } | null
      setEstado(desenlace(j?.estado, j?.motivo, j?.campo ?? null, j?.campos))
    } catch {
      setEstado({ tipo: 'aviso', texto: 'No hemos podido guardarlo (no hubo conexión). No se ha cambiado nada: inténtalo en un momento.' })
    }
  }

  return (
    <section className="seccion" aria-labelledby="mis-datos-titulo">
      <p className="antetitulo">Cómo te localizamos</p>
      <h2 id="mis-datos-titulo">Tus datos de contacto</h2>

      <p className="supresion-intro">
        Son el teléfono, el correo y la dirección que usamos <strong>nosotros</strong> para escribirte.{' '}
        <strong>No es la dirección que figura en tus pólizas:</strong> cambiarla aquí no se lo comunica a
        ninguna compañía. Si te has mudado, dínoslo también por teléfono o por correo — tu seguro de hogar
        sigue cubriendo la casa anterior hasta que la aseguradora lo cambie.
      </p>

      {/* Lo que NO se ha podido enseñar, dicho antes del formulario y no como
          un hueco. Cada caso con su frase: el que se arregla en Vercel, el que
          arregla el corredor y el que se arregla reintentando no son el mismo. */}
      {!leido && <p className="mi-direccion-aviso" role="status">{porQueNoSeLee(lectura)}</p>}
      {leido && lectura.ilegibles.length > 0 && (
        <p className="mi-direccion-aviso" role="status">
          No hemos podido leer {lectura.ilegibles.map((c) => ETIQUETA[c as CampoMisDatos] ?? c).join(' ni ')} que
          tenemos guardado, así que sale en blanco. Si lo escribes de nuevo, se sustituye.
        </p>
      )}

      <form onSubmit={guardar} className="mi-direccion-form">
        <fieldset className="mis-datos-grupo">
          <legend>Dónde te avisamos</legend>
          {CANALES.map((c) => campo(c, f, setF))}
        </fieldset>
        <fieldset className="mis-datos-grupo">
          <legend>Dónde te escribimos</legend>
          {DIRECCION.map((c) => campo(c, f, setF))}
        </fieldset>
        <button type="submit" className="boton" disabled={estado.tipo === 'guardando' || !hayCambios}>
          {estado.tipo === 'guardando' ? 'Guardando…' : 'Guardar mis datos'}
        </button>
      </form>

      {estado.tipo === 'guardado' && (
        <p role="status" className="mi-direccion-ok">
          {estado.texto} Recuerda: <strong>esto no cambia la dirección de tus pólizas.</strong>
        </p>
      )}
      {estado.tipo === 'aviso' && (
        <p role="status" className="mi-direccion-aviso">{estado.texto}</p>
      )}
    </section>
  )
}

function campo(c: Campo, f: Valores, setF: React.Dispatch<React.SetStateAction<Valores>>) {
  return (
    <label key={c.k} className="mi-direccion-campo">
      <span>{c.label}</span>
      <input
        type={c.tipo ?? 'text'}
        value={f[c.k]}
        onChange={(e) => setF((p) => ({ ...p, [c.k]: e.target.value }))}
        placeholder={c.placeholder}
        inputMode={c.modo}
        maxLength={c.max}
        autoComplete={c.autoComplete}
      />
    </label>
  )
}

/**
 * Qué viaja. Puro y exportado para el guardián: es la regla de «solo lo que
 * cambió», y la de que un canal no viaja vacío.
 */
export function cambiosRespectoA(original: Valores, actual: Valores, leido: boolean): Partial<Record<CampoMisDatos, string | null>> {
  const out: Partial<Record<CampoMisDatos, string | null>> = {}
  for (const c of CAMPOS) {
    const v = actual[c.k].trim()
    const antes = original[c.k].trim()
    if (v === antes) continue
    const esCanal = c.k === 'telefono' || c.k === 'email'
    if (v === '') {
      // Un canal no se borra desde aquí; y una dirección solo se vacía si se
      // sabía qué había (si no, no se sabe qué se está borrando).
      if (esCanal || !leido) continue
      out[c.k] = null
    } else {
      out[c.k] = v
    }
  }
  return out
}

function porQueNoSeLee(l: Exclude<LecturaMisDatos, { estado: 'ok' }>): string {
  switch (l.estado) {
    case 'sin_ficha':
      return 'Tu acceso todavía no está enlazado con tu ficha, así que no podemos enseñarte lo que tenemos ni guardar cambios. Escríbenos y lo enlazamos.'
    case 'varias_fichas':
      return 'Tienes más de una ficha con nosotros y no sabemos cuál enseñarte. Lo revisamos y te lo dejamos arreglado; mientras, dinos los cambios por teléfono o por correo.'
    case 'sin_puente':
      return 'Ahora mismo no podemos consultar tus datos de contacto ni guardar cambios. Vuelve a intentarlo más tarde.'
    default:
      return 'No hemos podido cargar tus datos de contacto ahora mismo. Los campos salen en blanco: no significa que no tengamos nada. Vuelve a intentarlo en un momento.'
  }
}

/**
 * El desenlace, en las palabras de quien lo lee. Está fuera del componente y es
 * puro para que el guardián pueda comprobar lo único que no se puede equivocar:
 * que **ningún camino que no haya guardado diga «guardado»**.
 */
export function desenlace(estado: string | undefined, motivo?: string, campo?: string | null, campos?: string[]): Estado {
  switch (estado) {
    case 'ok': {
      const que = (campos ?? []).map((c) => ETIQUETA[c as CampoMisDatos]).filter(Boolean)
      return { tipo: 'guardado', texto: que.length > 0 ? `Guardado: ${que.join(', ')}. Lo usaremos a partir de ahora.` : 'Guardado. Lo usaremos a partir de ahora.' }
    }
    case 'sin_cambios':
      return { tipo: 'aviso', texto: 'No has cambiado nada: lo que has escrito es lo que ya teníamos.' }
    case 'invalido':
      return {
        tipo: 'aviso',
        texto: `Revisa ${campo ? ETIQUETA[campo as CampoMisDatos] ?? 'lo que has escrito' : 'lo que has escrito'}${motivo ? ` (${motivo})` : ''}. No se ha cambiado nada.`,
      }
    // Ese número o ese correo ya está en la ficha de OTRA persona (un hijo, una
    // empresa). No se le pisa a nadie desde aquí: lo mira el corredor.
    case 'en_otra_ficha':
      return {
        tipo: 'aviso',
        texto: `${campo === 'email' ? 'Ese correo' : 'Ese teléfono'} ya figura en otra ficha nuestra, así que no lo hemos cambiado. Escríbenos y lo arreglamos.`,
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
