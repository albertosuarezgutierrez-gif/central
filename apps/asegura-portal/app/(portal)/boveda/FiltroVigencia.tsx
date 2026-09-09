'use client'
import { useId, useState, type ReactNode } from 'react'

/**
 * La lista de pólizas de UN titular, con su filtro: **por defecto solo las que
 * están en vigor**.
 *
 * ── Por qué (09/09/2026) ────────────────────────────────────────────────────
 * Alberto, mirando el panel de un cliente que le ha dado acceso: «lo suyo es
 * ver solo las pólizas en vigor y ocultar las canceladas porque da confusión;
 * crear un filtro por cada panel y que salga por defecto las que están en
 * vigor». Una cancelada de 2024 al lado de la del coche de este año se lee, de
 * un vistazo, como «tengo dos coches asegurados», y de eso vive el error de
 * llamar a la compañía equivocada.
 *
 * 🚨 Es un filtro POR TITULAR, no global: cada panel decide el suyo, y el
 * contador dice cuántas se están escondiendo. Esconder sin contar sería la
 * trampa de la casa —no falla nada, simplemente no se ve— y quien tiene una
 * cancelada con un recibo pendiente tiene que poder encontrarla.
 *
 * 🚨 Lo que se esconde es lo que NO está en vigor (`no_vigente`: cancelada,
 * vencida, fin de riesgo…). Lo `pendiente` —sin fecha de vencimiento, no se
 * sabe si está en vigor— se ENSEÑA: esconder lo que no se sabe sería decidir
 * por la persona que su póliza ha caducado.
 *
 * Las filas llegan YA pintadas desde el servidor (`FilaPoliza` es un
 * componente de servidor); aquí solo se decide cuáles se montan. Por eso el
 * filtro no vuelve a pedir nada y el cambio es instantáneo.
 */
export type FilaFiltrable = { key: string; enVigor: boolean; nodo: ReactNode }

export function FiltroVigencia({ filas }: { filas: FilaFiltrable[] }) {
  const [todas, setTodas] = useState(false)
  const id = useId()
  const enVigor = filas.filter((f) => f.enVigor)
  const fuera = filas.length - enVigor.length

  // Sin nada que esconder no hay filtro: un control con «Todas (3) / En vigor
  // (3)» es ruido, y esta lista la usa gente de 50-70 años.
  if (fuera === 0) return <ul className="polizas">{filas.map((f) => f.nodo)}</ul>

  const visibles = todas ? filas : enVigor
  return (
    <>
      <div className="filtro-vigencia" role="group" aria-label="Qué pólizas se muestran">
        <button
          type="button"
          className="filtro-vigencia-opcion"
          aria-pressed={!todas}
          onClick={() => setTodas(false)}
          aria-controls={id}
        >
          En vigor <span className="filtro-vigencia-n">{enVigor.length}</span>
        </button>
        <button
          type="button"
          className="filtro-vigencia-opcion"
          aria-pressed={todas}
          onClick={() => setTodas(true)}
          aria-controls={id}
        >
          Todas <span className="filtro-vigencia-n">{filas.length}</span>
        </button>
        {/* El contador de lo escondido va SIEMPRE que haya algo escondido: es
            lo que impide que «solo en vigor» se lea como «solo tienes esta». */}
        {!todas && (
          <span className="filtro-vigencia-nota">
            {fuera === 1 ? '1 póliza que ya no está en vigor, oculta' : `${fuera} pólizas que ya no están en vigor, ocultas`}
          </span>
        )}
      </div>
      {visibles.length === 0 ? (
        // Mismo `id` que la lista de abajo: los botones apuntan con
        // `aria-controls` a lo que esté visible, y las dos ramas son
        // mutuamente excluyentes — nunca coexisten dos elementos con este id.
        <p className="tenue" id={id} style={{ margin: '0 0 12px', fontSize: 14 }}>
          Ninguna en vigor ahora mismo.
        </p>
      ) : (
        <ul className="polizas" id={id}>
          {visibles.map((f) => f.nodo)}
        </ul>
      )}
    </>
  )
}
