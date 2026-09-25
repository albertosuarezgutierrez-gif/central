import type { ReactNode } from 'react'

/**
 * Un bloque de «Mis contactos» que se pliega (25/09/2026, Alberto: «la
 * pantalla contactos es muy extensa»). Seis bloques abiertos a la vez —texto
 * legal, dos listas, dos formularios y las sugerencias— eran varios
 * pantallazos antes de llegar a lo que uno buscaba.
 *
 * Mismo aspecto que `GrupoPlegable` de la cartera (clases `plegable-cartera-*`)
 * para que «se abre» se lea igual en todo el portal. El `resumen` va en la
 * cabecera y se ve con el bloque CERRADO: ahí va lo que hay dentro («2
 * personas», «nadie»), para que plegar no esconda la respuesta.
 */
export function SeccionPlegable({
  titulo,
  resumen,
  abierto = false,
  children,
}: {
  titulo: string
  resumen?: string | null
  abierto?: boolean
  children: ReactNode
}) {
  return (
    <section className="seccion">
      <details className="plegable-cartera" open={abierto}>
        <summary className="plegable-cartera-resumen">
          <h2 className="plegable-cartera-titulo">
            <span className="plegable-cartera-nombre">{titulo}</span>
            {resumen ? <span className="plegable-cartera-cuenta">{resumen}</span> : null}
          </h2>
        </summary>
        <div className="plegable-cartera-cuerpo">{children}</div>
      </details>
    </section>
  )
}

/** «1 persona» / «3 personas» / «nadie». */
export function textoPersonas(n: number): string {
  return n === 0 ? 'nadie' : n === 1 ? '1 persona' : `${n} personas`
}
