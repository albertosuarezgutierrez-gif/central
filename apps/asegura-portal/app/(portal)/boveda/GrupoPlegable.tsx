import type { ReactNode } from 'react'

import { textoCuentaSeguros } from '@central/module-seguros-portal'

/**
 * Un bloque de la bóveda que nace PLEGADO.
 *
 * ── Por qué (19/09/2026) ────────────────────────────────────────────────────
 *
 * Alberto, mirando su portal como lo ve un cliente: «cuando entra un cliente no
 * ve bien los seguros autorizados… que al cargar la pantalla salga todo plegado
 * por defecto». Con la cartera propia, las de sus sociedades y las de cada
 * persona que le ha autorizado, la primera pantalla era una tirada de filas sin
 * fin en la que el bloque de abajo —justo el que hay que ir a buscar— quedaba a
 * dos pantallazos de scroll. Plegados, los bloques caben todos a la vez y la
 * pantalla vuelve a decir QUÉ hay antes de enseñarlo.
 *
 * Es además la regla de rendimiento de la casa (desplegables cerrados por
 * defecto), con su matiz escrito: **un `<details>` cerrado crea igualmente todo
 * su DOM**. Aquí se acepta a propósito y no se monta nada perezoso: la cartera
 * viva entera son 110 pólizas entre 80 titulares, o sea decenas de filas por
 * persona en el peor caso. El día que un bloque traiga cientos, esto pide
 * montaje perezoso de verdad, no un `<details>`.
 *
 * 🚨 **La cabecera dice de QUIÉN es y CUÁNTOS hay, con el bloque cerrado.** Un
 * plegable sin cifra obliga a abrirlo para saber si merecía la pena abrirlo, y
 * uno sin nombre esconde de quién es la cartera que hay dentro — que es
 * exactamente lo que el chip «de {titular}» de cada fila existe para no dejar
 * que pase.
 *
 * Se usa `<details>` y no un botón con estado: **funciona sin JavaScript** (la
 * bóveda entera se sirve desde el servidor) y el navegador ya sabe anunciarlo
 * como plegable a un lector de pantalla. El titular va dentro del `<summary>`
 * como un `<h2>` —contenido de encabezado, que es lo único que el HTML admite
 * ahí además del texto llano— para no perder la navegación por encabezados.
 */
export function GrupoPlegable({
  antetitulo,
  titulo,
  cuenta,
  abierto,
  children,
}: {
  /** El rótulo en versalitas de encima del titular, o `null` si no lo lleva. */
  antetitulo?: string | null
  titulo: string
  /** Cuántas pólizas hay dentro, TODAS, también las que el filtro de vigencia esconda. */
  cuenta: number
  /**
   * 🚨 Abierto de salida SOLO cuando dentro no hay lista que plegar, sino una
   * explicación (no eres cliente, tu ficha no tiene pólizas vivas, no hemos
   * podido comprobarlo). Plegar un mensaje que dice por qué no ves nada lo
   * convierte en una pantalla vacía sin motivo.
   */
  abierto?: boolean
  children: ReactNode
}) {
  return (
    <section className="seccion">
      <details className="plegable-cartera" open={abierto}>
        <summary className="plegable-cartera-resumen">
          <h2 className="plegable-cartera-titulo">
            {antetitulo != null && antetitulo !== '' && (
              <span className="antetitulo">{antetitulo}</span>
            )}
            <span className="plegable-cartera-nombre">{titulo}</span>
            <span className="plegable-cartera-cuenta">{textoCuentaSeguros(cuenta)}</span>
          </h2>
        </summary>
        <div className="plegable-cartera-cuerpo">{children}</div>
      </details>
    </section>
  )
}
