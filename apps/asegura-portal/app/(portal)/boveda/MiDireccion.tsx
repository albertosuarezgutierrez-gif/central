'use client'
import { useState } from 'react'

/**
 * «Dónde te escribimos» — el cliente corrige su dirección de CONTACTO.
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
 * 2. 🚨 **No podemos enseñarle lo que tenemos guardado.** La calle va cifrada
 *    con una clave que esta app no tiene (a propósito: es la app pública). Así
 *    que el formulario sale VACÍO y lo dice — un campo vacío sin explicación se
 *    lee como «no consta ninguna dirección», que es afirmar algo que no se ha
 *    mirado.
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

const CAMPOS = [
  { k: 'direccion', label: 'Dirección', placeholder: 'Calle, número, piso', modo: undefined },
  { k: 'codigoPostal', label: 'Código postal', placeholder: '41003', modo: 'numeric' as const },
  { k: 'ciudad', label: 'Ciudad', placeholder: 'Sevilla', modo: undefined },
  { k: 'provincia', label: 'Provincia', placeholder: 'Sevilla', modo: undefined },
] as const

type Clave = (typeof CAMPOS)[number]['k']

export function MiDireccion() {
  const [f, setF] = useState<Record<Clave, string>>({ direccion: '', codigoPostal: '', ciudad: '', provincia: '' })
  const [estado, setEstado] = useState<Estado>({ tipo: 'listo' })

  const algoEscrito = Object.values(f).some((v) => v.trim() !== '')

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!algoEscrito) return
    setEstado({ tipo: 'guardando' })
    // Solo viajan los campos con algo escrito. En blanco NO significa «bórralo»:
    // como el formulario no puede mostrar lo que hay, tratar un hueco como un
    // borrado le vaciaría la ciudad a quien solo venía a cambiar la calle.
    const libre: Record<string, string> = {}
    for (const c of CAMPOS) if (f[c.k].trim() !== '') libre[c.k] = f[c.k].trim()
    try {
      const res = await fetch('/api/mis-datos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(libre),
      })
      const j = (await res.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      setEstado(desenlace(j?.estado, j?.motivo))
    } catch {
      setEstado({ tipo: 'aviso', texto: 'No hemos podido guardarlo (no hubo conexión). No se ha cambiado nada: inténtalo en un momento.' })
    }
  }

  return (
    <section className="tus-datos" aria-labelledby="mi-direccion-titulo">
      <h2 className="lista-titulo" id="mi-direccion-titulo">Dónde te escribimos</h2>

      <p className="supresion-intro">
        Es la dirección que usamos para escribirte nosotros. <strong>No es la dirección que figura en tus
        pólizas:</strong> cambiarla aquí no se lo comunica a ninguna compañía. Si te has mudado, dínoslo
        también por teléfono o por correo — tu seguro de hogar sigue cubriendo la casa anterior hasta que la
        aseguradora lo cambie.
      </p>

      <p className="supresion-intro">
        No podemos mostrarte la que tenemos guardada (está cifrada y esta pantalla no puede abrirla), así que
        los campos salen en blanco. <strong>Escribe solo lo que quieras cambiar:</strong> lo que dejes vacío
        se queda como está.
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
              maxLength={c.k === 'codigoPostal' ? 5 : 200}
              autoComplete="off"
            />
          </label>
        ))}
        <button type="submit" className="boton" disabled={estado.tipo === 'guardando' || !algoEscrito}>
          {estado.tipo === 'guardando' ? 'Guardando…' : 'Guardar mi dirección'}
        </button>
      </form>

      {estado.tipo === 'guardado' && (
        <p role="status" className="mi-direccion-ok">
          Guardado. Lo usaremos para escribirte a partir de ahora. Recuerda: <strong>esto no cambia la
          dirección de tus pólizas.</strong>
        </p>
      )}
      {estado.tipo === 'aviso' && (
        <p role="status" className="mi-direccion-aviso">{estado.texto}</p>
      )}
    </section>
  )
}

/**
 * El desenlace, en las palabras de quien lo lee. Está fuera del componente y es
 * puro para que el guardián pueda comprobar lo único que no se puede equivocar:
 * que **ningún camino que no haya guardado diga «guardado»**.
 */
export function desenlace(estado: string | undefined, motivo?: string): Estado {
  switch (estado) {
    case 'ok':
      return { tipo: 'guardado' }
    case 'sin_cambios':
      return { tipo: 'aviso', texto: 'No has cambiado nada: lo que has escrito es lo que ya teníamos.' }
    case 'invalido':
      return {
        tipo: 'aviso',
        texto: `Revisa lo que has escrito${motivo ? ` (${motivo})` : ''}. No se ha cambiado nada.`,
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
        texto: 'Tienes más de una ficha con nosotros y no queremos escribir la dirección en la que no es. Lo revisamos y te lo dejamos arreglado.',
      }
    case 'sin_puente':
      return {
        tipo: 'aviso',
        texto: 'Ahora mismo no podemos guardar cambios de dirección. No se ha cambiado nada; vuelve a intentarlo más tarde.',
      }
    default:
      return {
        tipo: 'aviso',
        texto: 'No hemos podido guardarlo. No se ha cambiado nada: inténtalo de nuevo en un momento.',
      }
  }
}
