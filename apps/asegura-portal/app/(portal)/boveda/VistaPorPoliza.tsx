import type { ReactNode } from 'react'

import type { BloqueCartera, TitularAgrupable } from '@central/module-seguros-portal'

import type { PolizaPortal } from '@/lib/cartera-lectura'


import { IconoRamo, tituloDePoliza } from './PolizaVista'

/**
 * Lo que esta vista necesita de un titular, y nada más: su identidad, su
 * nombre, sus pólizas y lo que `agruparCartera` usa para repartirlo. Se declara
 * aquí en vez de pedir el `TitularPortal` entero para dejar escrito que esta
 * pantalla no mira el nivel de acceso ni la autorización: quién ve qué campos
 * ya lo decidió `lib/cartera-lectura.ts`, mucho antes de llegar aquí.
 */
type TitularConPolizas = TitularAgrupable & { nombre: string; polizas: PolizaPortal[] }

/**
 * El armazón de las pestañas «Recibos» y «Siniestros»: la MISMA lista de
 * pólizas que la bóveda, con el bloque correspondiente debajo de cada una.
 *
 * ── Por qué existen esas pestañas (07/09/2026) ──────────────────────────────
 *
 * Alberto, tres veces sobre su portal: *«sigue sin aparecer siniestros ni
 * recibo»*. Los datos SÍ estaban —en la ficha de cada póliza— pero solo los
 * encontraba quien entrara póliza a póliza.
 *
 * ⚠️ Esto CONTRADICE una decisión escrita en `vista-portal.ts` («una pestaña
 * que casi siempre dice cero parece un producto a medio hacer»), así que se
 * midió antes de tocar nada, sobre la cartera viva del 07/09/2026:
 *
 *   · **55 de los 80 titulares (69 %) tienen al menos un recibo no anulado.**
 *     Para recibos, aquel argumento sencillamente no se sostiene.
 *   · **31 de 80 (39 %) tienen algún siniestro.** Aquí sí: 6 de cada 10 verán
 *     la pestaña vacía — y por eso el vacío no puede ser un hueco en blanco,
 *     sino la frase que ya usa el resto del portal («no nos consta ninguno»,
 *     que NO es «no has tenido ninguno»).
 *
 * ── 🚨 Una póliza cuyo bloque no se ve se OMITE, no se anuncia ──────────────
 *
 * `p.recibos === null` y `p.siniestros === null` significan «tu nivel no lo
 * enseña», y eso pasa justo con un tercero autorizado. Pintar su título con un
 * «no visible» debajo le contaría que ahí hay algo que mirar, que es la mitad
 * de la filtración — la misma razón por la que `siniestrosAbiertos` no pinta
 * nada en la bóveda. Por eso quien llama pasa `incluye`, y las que no entran
 * desaparecen sin dejar rastro.
 *
 * ── Y la separación por titular se CONSERVA ────────────────────────────────
 *
 * Se reciben los mismos bloques de `agruparCartera` que pinta la bóveda: si
 * las pólizas de tu empresa van aparte allí, sus recibos van aparte aquí. Una
 * lista de recibos que mezclara los tuyos con los de tu padre sería el mismo
 * fallo que se acaba de cerrar, en otra pantalla.
 */
export function VistaPorPoliza({
  bloques,
  incluye,
  bloque,
  vacio,
}: {
  bloques: readonly BloqueCartera<TitularConPolizas>[]
  /** Qué pólizas entran. Las que no, se omiten enteras (ver cabecera). */
  incluye: (p: PolizaPortal) => boolean
  /** Lo que se pinta debajo del título de cada póliza. */
  bloque: (p: PolizaPortal) => ReactNode
  /** Lo que se dice cuando no queda ninguna póliza que enseñar. */
  vacio: ReactNode
}) {
  const conContenido = bloques
    .map((b) => ({
      ...b,
      titulares: b.titulares
        .map((t) => ({ ...t, polizas: t.polizas.filter(incluye) }))
        .filter((t) => t.polizas.length > 0),
    }))
    .filter((b) => b.titulares.length > 0)

  if (conContenido.length === 0) {
    return <p className="suave" style={{ margin: 0 }}>{vacio}</p>
  }

  return (
    <>
      {conContenido.map((b) => (
        <section key={b.grupo} className="seccion" aria-labelledby={`${b.grupo}-titulo`}>
          <h2 id={`${b.grupo}-titulo`}>{b.titulo}</h2>
          {b.titulares.map((t) => (
            <div key={t.clienteId}>
              {/* La misma cabecera pegajosa de la bóveda, y por lo mismo: un
                  título normal se va con el scroll y entonces no se sabe de
                  quién es el recibo que se está mirando. */}
              {b.conNombre && <h3 className="titular-cabecera">{t.nombre}</h3>}
              {t.polizas.map((p) => (
                <div key={p.id} className="poliza-bloque">
                  <h4 className="poliza-bloque-titulo">
                    <IconoRamo ramo={p.ramo} />
                    {tituloDePoliza(p)}
                  </h4>
                  {bloque(p)}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </>
  )
}
